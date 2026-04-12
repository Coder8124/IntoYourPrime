import {
  Timestamp,
  addDoc,
  collection,
  collectionGroup,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import {
  type ActivityFeedItem,
  type DailyLog,
  type FriendConnection,
  type Session,
  type UserProfile,
  fromFirestoreLog,
  fromFirestoreSession,
  toFirestoreLog,
  toFirestoreSession,
} from '../types'
import { auth, db } from './firebase'

function wrapError(op: string, err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err)
  throw new Error(`FormIQ Firestore (${op}): ${msg}`)
}

function assertSignedUid(uid: string, op: string): void {
  const current = auth.currentUser?.uid
  if (current && current !== uid) {
    throw new Error(`FormIQ (${op}): signed-in user does not match target uid`)
  }
}

function toYyyyMmDdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayLocal(): string {
  return toYyyyMmDdLocal(new Date())
}

function yesterdayLocal(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return toYyyyMmDdLocal(d)
}

function normalizeYyyyMmDd(value: string | null): string | null {
  if (value === null) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  if (value.length >= 10) return value.slice(0, 10)
  return value
}

function cutoffDateString(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return toYyyyMmDdLocal(d)
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v
  }
  return out
}

function readTimestampAsDate(value: unknown, field: string): Date {
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  throw new Error(`FormIQ: expected Firestore Timestamp for ${field}`)
}

function userProfileFromDoc(snap: DocumentSnapshot): UserProfile | null {
  if (!snap.exists()) return null
  const d = snap.data() as Record<string, unknown>
  return {
    uid: String(d.uid ?? snap.id),
    email: String(d.email ?? ''),
    displayName: String(d.displayName ?? ''),
    age: Number(d.age),
    weightKg: Number(d.weightKg),
    heightCm: Number(d.heightCm),
    biologicalSex: d.biologicalSex as UserProfile['biologicalSex'],
    fitnessLevel: d.fitnessLevel as UserProfile['fitnessLevel'],
    createdAt: readTimestampAsDate(d.createdAt, 'createdAt'),
    streakCount: Number(d.streakCount ?? 0),
    lastWorkoutDate:
      d.lastWorkoutDate === null || d.lastWorkoutDate === undefined
        ? null
        : String(d.lastWorkoutDate),
  }
}

function friendFromDoc(
  snap: QueryDocumentSnapshot,
  viewerUid: string,
  otherProfile: UserProfile | null,
): FriendConnection {
  const d = snap.data() as Record<string, unknown>
  const userId = String(d.userId)
  const friendId = String(d.friendId)
  const otherUid = userId === viewerUid ? friendId : userId

  let friendDisplayName = String(d.friendDisplayName ?? '')
  let friendEmail = String(d.friendEmail ?? '')
  if (friendId === viewerUid && otherProfile) {
    friendDisplayName = otherProfile.displayName
    friendEmail = otherProfile.email
  }

  return {
    id: snap.id,
    userId: viewerUid,
    friendId: otherUid,
    friendDisplayName,
    friendEmail,
    status: d.status as FriendConnection['status'],
    sharedStreak: Number(d.sharedStreak ?? 0),
    lastSharedWorkoutDate:
      d.lastSharedWorkoutDate === null || d.lastSharedWorkoutDate === undefined
        ? null
        : String(d.lastSharedWorkoutDate),
    createdAt: readTimestampAsDate(d.createdAt, 'createdAt'),
  }
}

function activityItemFromDoc(snap: QueryDocumentSnapshot): ActivityFeedItem {
  const d = snap.data() as Record<string, unknown>
  const item: ActivityFeedItem = {
    id: snap.id,
    userId: String(d.userId),
    displayName: String(d.displayName),
    type: d.type as ActivityFeedItem['type'],
    timestamp: readTimestampAsDate(d.timestamp, 'timestamp'),
  }
  if (d.sessionId !== undefined) item.sessionId = String(d.sessionId)
  if (d.warmupScore !== undefined) item.warmupScore = Number(d.warmupScore)
  if (d.avgRiskScore !== undefined) item.avgRiskScore = Number(d.avgRiskScore)
  if (d.streak !== undefined) item.streak = Number(d.streak)
  return item
}

function toFirestoreActivityItem(item: Omit<ActivityFeedItem, 'id'>): Record<string, unknown> {
  const base: Record<string, unknown> = {
    userId: item.userId,
    displayName: item.displayName,
    type: item.type,
    timestamp: Timestamp.fromDate(item.timestamp),
  }
  if (item.sessionId !== undefined) base.sessionId = item.sessionId
  if (item.warmupScore !== undefined) base.warmupScore = item.warmupScore
  if (item.avgRiskScore !== undefined) base.avgRiskScore = item.avgRiskScore
  if (item.streak !== undefined) base.streak = item.streak
  return base
}

function profileUpdatesToFirestore(updates: Partial<UserProfile>): Record<string, unknown> {
  const rest = { ...updates } as Record<string, unknown>
  delete rest.uid
  const cleaned = stripUndefined(rest)
  if (cleaned.createdAt instanceof Date) {
    cleaned.createdAt = Timestamp.fromDate(cleaned.createdAt)
  }
  return cleaned
}

async function findUserByEmail(email: string): Promise<UserProfile | null> {
  const normalized = email.trim().toLowerCase()
  const q = query(
    collection(db, 'users'),
    where('email', '==', normalized),
    limit(1),
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  return userProfileFromDoc(snap.docs[0])
}

async function acceptedConnectionExists(a: string, b: string): Promise<boolean> {
  const q1 = query(
    collection(db, 'friendConnections'),
    where('userId', '==', a),
    where('friendId', '==', b),
    where('status', '==', 'accepted'),
    limit(1),
  )
  const q2 = query(
    collection(db, 'friendConnections'),
    where('userId', '==', b),
    where('friendId', '==', a),
    where('status', '==', 'accepted'),
    limit(1),
  )
  const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)])
  return !s1.empty || !s2.empty
}

async function pendingConnectionExists(a: string, b: string): Promise<boolean> {
  const q1 = query(
    collection(db, 'friendConnections'),
    where('userId', '==', a),
    where('friendId', '==', b),
    where('status', '==', 'pending'),
    limit(1),
  )
  const q2 = query(
    collection(db, 'friendConnections'),
    where('userId', '==', b),
    where('friendId', '==', a),
    where('status', '==', 'pending'),
    limit(1),
  )
  const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)])
  return !s1.empty || !s2.empty
}

// ——— USER PROFILE ———

export async function createUserProfile(
  uid: string,
  data: Omit<UserProfile, 'uid' | 'createdAt' | 'streakCount' | 'lastWorkoutDate'>,
): Promise<void> {
  try {
    assertSignedUid(uid, 'createUserProfile')
    const email = data.email.trim().toLowerCase()
    await setDoc(doc(db, 'users', uid), {
      uid,
      ...data,
      email,
      createdAt: Timestamp.now(),
      streakCount: 0,
      lastWorkoutDate: null,
    })
  } catch (e) {
    wrapError('createUserProfile', e)
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    return userProfileFromDoc(snap)
  } catch (e) {
    wrapError('getUserProfile', e)
  }
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<UserProfile>,
): Promise<void> {
  try {
    assertSignedUid(uid, 'updateUserProfile')
    const payload = profileUpdatesToFirestore(updates)
    if (Object.keys(payload).length === 0) return
    await updateDoc(doc(db, 'users', uid), payload)
  } catch (e) {
    wrapError('updateUserProfile', e)
  }
}

export async function updateStreak(uid: string): Promise<void> {
  try {
    assertSignedUid(uid, 'updateStreak')
    const userRef = doc(db, 'users', uid)
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef)
      if (!snap.exists()) {
        throw new Error('user profile not found')
      }
      const d = snap.data() as Record<string, unknown>
      const lastRaw = d.lastWorkoutDate === null || d.lastWorkoutDate === undefined
        ? null
        : String(d.lastWorkoutDate)
      const last = normalizeYyyyMmDd(lastRaw)
      const today = todayLocal()
      const yesterday = yesterdayLocal()

      if (last === today) {
        return
      }

      const prevStreak = Number(d.streakCount ?? 0)
      let nextStreak = 1
      if (last === yesterday) {
        nextStreak = prevStreak + 1
      }

      tx.update(userRef, {
        streakCount: nextStreak,
        lastWorkoutDate: today,
      })
    })
  } catch (e) {
    wrapError('updateStreak', e)
  }
}

// ——— SESSIONS ———

export async function saveSession(session: Omit<Session, 'id'>): Promise<string> {
  try {
    assertSignedUid(session.userId, 'saveSession')
    const col = collection(db, 'users', session.userId, 'sessions')
    const ref = doc(col)
    const full: Session = { ...session, id: ref.id }
    await setDoc(ref, toFirestoreSession(full))
    return ref.id
  } catch (e) {
    wrapError('saveSession', e)
  }
}

export async function getSession(sessionId: string): Promise<Session | null> {
  try {
    const q = query(
      collectionGroup(db, 'sessions'),
      where(documentId(), '==', sessionId),
      limit(1),
    )
    const snap = await getDocs(q)
    if (snap.empty) return null
    const docSnap = snap.docs[0]
    return fromFirestoreSession({ ...docSnap.data(), id: docSnap.id })
  } catch (e) {
    wrapError('getSession', e)
  }
}

export async function getUserSessions(
  uid: string,
  limitCount = 20,
): Promise<Session[]> {
  try {
    const q = query(
      collection(db, 'users', uid, 'sessions'),
      orderBy('date', 'desc'),
      limit(limitCount),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) =>
      fromFirestoreSession({ ...d.data(), id: d.id }),
    )
  } catch (e) {
    wrapError('getUserSessions', e)
  }
}

export async function getRecentSessions(uid: string, days: number): Promise<Session[]> {
  try {
    if (days <= 0) return []
    const cutoff = cutoffDateString(days)
    const q = query(
      collection(db, 'users', uid, 'sessions'),
      where('date', '>=', cutoff),
      orderBy('date', 'desc'),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) =>
      fromFirestoreSession({ ...d.data(), id: d.id }),
    )
  } catch (e) {
    wrapError('getRecentSessions', e)
  }
}

// ——— DAILY LOGS ———

export async function saveDailyLog(log: Omit<DailyLog, 'id'>): Promise<string> {
  try {
    assertSignedUid(log.userId, 'saveDailyLog')
    const docId = log.date
    const ref = doc(db, 'users', log.userId, 'logs', docId)
    const full: DailyLog = { ...log, id: docId }
    await setDoc(ref, toFirestoreLog(full))
    return docId
  } catch (e) {
    wrapError('saveDailyLog', e)
  }
}

export async function getTodayLog(uid: string): Promise<DailyLog | null> {
  try {
    const id = todayLocal()
    const snap = await getDoc(doc(db, 'users', uid, 'logs', id))
    if (!snap.exists()) return null
    return fromFirestoreLog({ ...snap.data(), id: snap.id })
  } catch (e) {
    wrapError('getTodayLog', e)
  }
}

export async function getRecentLogs(uid: string, days: number): Promise<DailyLog[]> {
  try {
    if (days <= 0) return []
    const cutoff = cutoffDateString(days)
    const q = query(
      collection(db, 'users', uid, 'logs'),
      where('date', '>=', cutoff),
      orderBy('date', 'desc'),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) =>
      fromFirestoreLog({ ...d.data(), id: d.id }),
    )
  } catch (e) {
    wrapError('getRecentLogs', e)
  }
}

// ——— FRIENDS ———

export async function sendFriendRequest(
  fromUid: string,
  toEmail: string,
): Promise<'sent' | 'already_friends' | 'not_found'> {
  try {
    assertSignedUid(fromUid, 'sendFriendRequest')
    const toProfile = await findUserByEmail(toEmail)
    if (!toProfile) return 'not_found'
    const toUid = toProfile.uid
    if (toUid === fromUid) return 'not_found'

    if (await acceptedConnectionExists(fromUid, toUid)) {
      return 'already_friends'
    }
    if (await pendingConnectionExists(fromUid, toUid)) {
      return 'sent'
    }

    await addDoc(collection(db, 'friendConnections'), {
      userId: fromUid,
      friendId: toUid,
      friendDisplayName: toProfile.displayName,
      friendEmail: toProfile.email,
      status: 'pending',
      sharedStreak: 0,
      lastSharedWorkoutDate: null,
      createdAt: Timestamp.now(),
    })
    return 'sent'
  } catch (e) {
    wrapError('sendFriendRequest', e)
  }
}

export async function acceptFriendRequest(connectionId: string): Promise<void> {
  try {
    const ref = doc(db, 'friendConnections', connectionId)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      throw new Error('friend request not found')
    }
    const d = snap.data() as Record<string, unknown>
    const invitee = String(d.friendId)
    assertSignedUid(invitee, 'acceptFriendRequest')
    await updateDoc(ref, { status: 'accepted' })
  } catch (e) {
    wrapError('acceptFriendRequest', e)
  }
}

export async function getFriends(uid: string): Promise<FriendConnection[]> {
  try {
    const q1 = query(
      collection(db, 'friendConnections'),
      where('userId', '==', uid),
      where('status', '==', 'accepted'),
    )
    const q2 = query(
      collection(db, 'friendConnections'),
      where('friendId', '==', uid),
      where('status', '==', 'accepted'),
    )
    const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)])
    const byId = new Map<string, QueryDocumentSnapshot>()
    for (const d of s1.docs) byId.set(d.id, d)
    for (const d of s2.docs) byId.set(d.id, d)

    const out: FriendConnection[] = []
    for (const d of byId.values()) {
      const data = d.data() as Record<string, unknown>
      const userId = String(data.userId)
      const friendId = String(data.friendId)
      const otherProfile =
        friendId === uid ? await getUserProfile(userId) : null
      out.push(friendFromDoc(d, uid, otherProfile))
    }
    return out
  } catch (e) {
    wrapError('getFriends', e)
  }
}

const IN_QUERY_MAX = 10

export async function getActivityFeed(uid: string): Promise<ActivityFeedItem[]> {
  try {
    const friends = await getFriends(uid)
    const uids = [uid, ...friends.map((f) => f.friendId)]
    const uniqueUids = [...new Set(uids)]

    const chunks: string[][] = []
    for (let i = 0; i < uniqueUids.length; i += IN_QUERY_MAX) {
      chunks.push(uniqueUids.slice(i, i + IN_QUERY_MAX))
    }

    const snapshots = await Promise.all(
      chunks.map((chunk) =>
        getDocs(
          query(
            collection(db, 'activityFeed'),
            where('userId', 'in', chunk),
            orderBy('timestamp', 'desc'),
            limit(20),
          ),
        ),
      ),
    )

    const items: ActivityFeedItem[] = []
    for (const snap of snapshots) {
      for (const d of snap.docs) {
        items.push(activityItemFromDoc(d))
      }
    }

    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    return items.slice(0, 20)
  } catch (e) {
    wrapError('getActivityFeed', e)
  }
}

export async function postActivityItem(item: Omit<ActivityFeedItem, 'id'>): Promise<void> {
  try {
    assertSignedUid(item.userId, 'postActivityItem')
    await addDoc(collection(db, 'activityFeed'), toFirestoreActivityItem(item))
  } catch (e) {
    wrapError('postActivityItem', e)
  }
}

// ——— RECOVERY ANALYSIS ———

export async function getRecoveryContext(
  uid: string,
): Promise<{ sessions: Session[]; logs: DailyLog[] }> {
  try {
    const [sessions, logs] = await Promise.all([
      getRecentSessions(uid, 21),
      getRecentLogs(uid, 21),
    ])
    return { sessions, logs }
  } catch (e) {
    wrapError('getRecoveryContext', e)
  }
}
