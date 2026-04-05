import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, signInAnonymously, type Auth } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from "firebase/firestore";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBWaDFwl37xaER6sACMA5F6p1SiRCghzoQ",
  authDomain: "samzykari-22819.firebaseapp.com",
  projectId: "samzykari-22819",
  storageBucket: "samzykari-22819.firebasestorage.app",
  messagingSenderId: "936152324226",
  appId: "1:936152324226:web:d1eba01a43aed3a050fc9b",
};

type RoomStatus = "open" | "in-use" | "closed";

interface RoomDoc {
  hostPeerId: string;
  hostUid: string;
  guestUid?: string;
  status: RoomStatus;
  createdAt?: Timestamp | ReturnType<typeof serverTimestamp>;
  updatedAt?: Timestamp | ReturnType<typeof serverTimestamp>;
}

export class MatchmakingService {
  private readonly _staleMs = 5 * 60 * 1000;
  private _app: FirebaseApp | null = null;
  private _auth: Auth | null = null;
  private _db: Firestore | null = null;
  private _initPromise: Promise<void> | null = null;

  async createRoom(hostPeerId: string): Promise<string> {
    await this._ensureReady();
    const uid = this._auth?.currentUser?.uid;
    if (!this._db || !uid) throw new Error("Firebase auth unavailable");

    let code = "";
    for (let i = 0; i < 5; i++) {
      code = this._generateCode(6);
      const roomRef = doc(this._db, "rooms", code);
      const existing = await getDoc(roomRef);
      if (!existing.exists()) {
        await setDoc(roomRef, {
          hostPeerId,
          hostUid: uid,
          status: "open",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        } satisfies RoomDoc);
        return code;
      }
    }

    throw new Error("Unable to create a unique room code");
  }

  async joinRoom(code: string): Promise<string | null> {
    await this._ensureReady();
    const uid = this._auth?.currentUser?.uid;
    if (!this._db || !uid) throw new Error("Firebase auth unavailable");

    const roomRef = doc(this._db, "rooms", code);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return null;

    const data = snap.data() as RoomDoc;
    if (!data.hostPeerId || data.status !== "open") return null;
    if (this._isRoomStale(data)) {
      await deleteDoc(roomRef);
      return null;
    }

    await updateDoc(roomRef, {
      status: "in-use",
      guestUid: uid,
      updatedAt: serverTimestamp(),
    } satisfies Partial<RoomDoc>);

    return data.hostPeerId;
  }

  async quickMatch(): Promise<{ code: string; hostPeerId: string } | null> {
    await this._ensureReady();
    const uid = this._auth?.currentUser?.uid;
    if (!this._db || !uid) throw new Error("Firebase auth unavailable");

    const roomsRef = collection(this._db, "rooms");
    const q = query(
      roomsRef,
      where("status", "==", "open"),
      orderBy("updatedAt", "desc"),
      limit(10)
    );

    const snap = await getDocs(q);
    for (const docSnap of snap.docs) {
      const data = docSnap.data() as RoomDoc;
      if (!data.hostPeerId) continue;
      if (this._isRoomStale(data)) {
        await deleteDoc(docSnap.ref);
        continue;
      }

      await updateDoc(docSnap.ref, {
        status: "in-use",
        guestUid: uid,
        updatedAt: serverTimestamp(),
      } satisfies Partial<RoomDoc>);

      return { code: docSnap.id, hostPeerId: data.hostPeerId };
    }

    return null;
  }

  async closeRoom(code: string): Promise<void> {
    await this._ensureReady();
    if (!this._db) return;

    const roomRef = doc(this._db, "rooms", code);
    try {
      await deleteDoc(roomRef);
    } catch {
      await updateDoc(roomRef, {
        status: "closed",
        updatedAt: serverTimestamp(),
      } satisfies Partial<RoomDoc>);
    }
  }

  private async _ensureReady(): Promise<void> {
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      this._app = initializeApp(FIREBASE_CONFIG);
      this._auth = getAuth(this._app);
      this._db = getFirestore(this._app);

      if (!this._auth.currentUser) {
        await signInAnonymously(this._auth);
      }
    })();

    return this._initPromise;
  }

  private _generateCode(length: number): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < length; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  private _isRoomStale(room: RoomDoc): boolean {
    const stamp = room.updatedAt ?? room.createdAt;
    if (!stamp || typeof (stamp as Timestamp).toMillis !== "function") return false;
    const updatedMs = (stamp as Timestamp).toMillis();
    return Date.now() - updatedMs > this._staleMs;
  }
}
