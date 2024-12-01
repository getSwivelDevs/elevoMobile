import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";

admin.initializeApp();

const ONESIGNAL_APP_ID = functions.config().onesignal.app_id;
const ONESIGNAL_API_KEY = functions.config().onesignal.api_key;

export const notifyOnNewProduct = functions.firestore
  .document("products/{productId}")
  .onCreate(async (snapshot, context) => {
    const productData = snapshot.data();
    if (!productData) {
      console.error("No product data found.");
      return;
    }

    const productName = productData.name || "a new product";
    const message = `${productName} has been added to the store!`;
    const path = productData.url || "elevolearning://elevolearning.com/suppliesView";

    const notificationPayload = {
      app_id: ONESIGNAL_APP_ID,
      included_segments: ["All"], // Adjust as needed (e.g., specific tags or user segments)
      headings: { en: "New Product Alert!" },
      contents: { en: message },
      app_url: path,
    };

    try {
      // Send OneSignal notification
      const response = await axios.post(
        "https://onesignal.com/api/v1/notifications",
        notificationPayload,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${ONESIGNAL_API_KEY}`,
          },
        }
      );
      console.log("Notification sent successfully:", response.data);

      // Add notification to users' notifications subcollection
      const usersSnapshot = await admin.firestore().collection("users")
        .where("allowNotifications", "==", true)
        .get();

      const batch = admin.firestore().batch();

      // Array to track notification references for each user
      const userNotificationUpdates: Array<Promise<void>> = [];

      usersSnapshot.forEach((userDoc) => {
        const notificationRef = userDoc.ref.collection("notifications").doc();
        
        // Create notification document
        batch.set(notificationRef, {
          type: "product", // Assuming the type is related to products
          created_at: admin.firestore.FieldValue.serverTimestamp(),
          description: `New supplies available! Add ${productName} to your next order.`,
          message: `${productName} has recently been added.`,
          read: false, // Notifications are unread by default
          path,
        });

        // Update user document to add notification reference to newNotifications array
        userNotificationUpdates.push(
          (async () => {
            await userDoc.ref.update({
              newNotifications: admin.firestore.FieldValue.arrayUnion(notificationRef)
            });
          })()
        );
      });

      // Commit batch write for notifications
      await batch.commit();

      // Await all user document updates
      await Promise.all(userNotificationUpdates);

      console.log("Notifications added to user subcollections and user documents successfully.");
    } catch (error) {
      console.error("Error sending notification or updating user notifications:", error);
    }
  });


  export const onNotificationRead = functions.firestore
    .document('users/{userId}/notifications/{notificationId}')
    .onUpdate(async (change, context) => {
        // Get the document data before and after the update
        const beforeData = change.before.data();
        const afterData = change.after.data();

        // Check if the 'read' field has changed to true
        if (beforeData?.read !== true && afterData?.read === true) {
            const userId = context.params.userId;
            const notificationId = context.params.notificationId;

            // Get the user document reference
            const userRef = admin.firestore().doc(`users/${userId}`);

            // Get the user document data
            const userSnapshot = await userRef.get();
            if (!userSnapshot.exists) {
                console.log(`User document not found: ${userId}`);
                return null;
            }

            const userData = userSnapshot.data();
            const newNotifications: admin.firestore.FieldValue[] = userData?.newNotifications || [];

            // Remove the notification reference from the 'newNotifications' array
            const updatedNotifications = newNotifications.filter((notificationRef: any) => {
                return notificationRef.id !== notificationId; // Compare by document ID
            });

            // Update the user's document with the new array
            return userRef.update({
                newNotifications: updatedNotifications
            }).then(() => {
                console.log(`Notification ${notificationId} removed from user ${userId}'s newNotifications.`);
                return null;
            }).catch((error) => {
                console.error('Error removing notification:', error);
                return null;
            });
        }

        // If the 'read' field didn't change to true, do nothing
        return null;
    });