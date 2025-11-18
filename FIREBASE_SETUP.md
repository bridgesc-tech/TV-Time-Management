# Firebase Sync Setup Instructions

To enable syncing between multiple phones, you need to set up a free Firebase project.

## Step 1: Create Firebase Project

1. Go to https://console.firebase.google.com/
2. Click "Add project" or "Create a project"
3. Enter a project name (e.g., "TV Time Manager")
4. Disable Google Analytics (not needed for this)
5. Click "Create project"

## Step 2: Enable Firestore Database

1. In your Firebase project, click "Firestore Database" in the left menu
2. Click "Create database"
3. Choose "Start in test mode" (for now - you can add security rules later)
4. Select a location (choose closest to you)
5. Click "Enable"

## Step 3: Get Your Configuration

1. In Firebase, click the gear icon ⚙️ next to "Project Overview"
2. Click "Project settings"
3. Scroll down to "Your apps" section
4. Click the "</>" (Web) icon
5. Register app with nickname "TV Time Manager"
6. Copy the `firebaseConfig` object

## Step 4: Update firebase-config.js

1. Open `firebase-config.js` in your TV Time Manager folder
2. Replace all the placeholder values with your actual Firebase config:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_ACTUAL_API_KEY",
    authDomain: "your-project-id.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef"
};
```

3. Save the file

## Step 5: Share Family ID Between Phones

1. On the FIRST phone, open the app and note the Family ID (check browser console or localStorage)
2. On the SECOND phone, you need to set the same Family ID:
   - Open browser console (F12)
   - Type: `localStorage.setItem('tvTimeFamilyId', 'THE_FAMILY_ID_FROM_PHONE_1')`
   - Refresh the page

**OR** easier method - add a Family ID input to the UI (we can add this feature if you want)

## Step 6: Test Sync

1. Add a child on Phone 1
2. Within a few seconds, the child should appear on Phone 2 automatically
3. Adjust time on Phone 1 - it should sync to Phone 2

## Security (Optional but Recommended)

After testing, add security rules to Firestore:

1. Go to Firestore Database → Rules
2. Replace with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /families/{familyId} {
      allow read, write: if true; // For now - anyone with family ID can access
      // Later you can add authentication
    }
  }
}
```

3. Click "Publish"

## Troubleshooting

- **Not syncing?** Check browser console for errors
- **Family ID not matching?** Make sure both phones have the same Family ID
- **Firebase config wrong?** Double-check all values in firebase-config.js
- **Still doesn't work?** Make sure you're accessing via HTTPS (required for Firebase)

## Notes

- Firebase free tier is very generous - you won't hit limits for personal use
- All data is stored in Firestore (accessible from Firebase Console)
- Data still works offline - syncs when connection is restored
- Family ID is stored in localStorage - share it between phones to sync


