# School Library Management Software

A React, TypeScript, and Firebase application for managing a school library's books, students, classes, issue/return workflow, history, imports/exports, and PDF reports.

## Firebase boundaries

- Firebase project: `inter-level-progress-manager`
- Firebase Web App ID: `1:379503088311:web:9496a80a937cd22d133332`
- Canonical app key: `schoolLibraryManagement`
- Data root: `/apps/schoolLibraryManagement/users/{uid}/...`
- Hosting site: `school-library-management-software`

This repository intentionally contains no Firestore or Storage rules. Their only authoritative source is [school-softwares-firebase-shared-config](https://github.com/jeevanvarghese579/school-softwares-firebase-shared-config). Never run an unscoped Firebase deployment from this repository.

## Local development

```powershell
npm install
npm run dev
```

Firebase Authentication must have Email/Password enabled. Creating an account does not grant application access; an Access Manager administrator must grant access for the fixed Web App ID.

## Verification and Hosting deployment

```powershell
npm run verify
firebase deploy --only hosting:school-library-management-software --project inter-level-progress-manager
```

The Hosting rewrite in `firebase.json` supports React Router routes. The deployment configuration contains Hosting only and cannot replace shared Firestore or Storage rules.
