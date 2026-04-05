declare module "firebase/app" {
  export { initializeApp } from "@firebase/app";
  export type { FirebaseApp, FirebaseAppSettings, FirebaseOptions } from "@firebase/app";
}

declare module "firebase/auth" {
  export { getAuth, signInAnonymously } from "@firebase/auth";
  export type { Auth } from "@firebase/auth";
}

declare module "firebase/firestore" {
  export {
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
  } from "@firebase/firestore";
  export type { Firestore, Timestamp } from "@firebase/firestore";
}
