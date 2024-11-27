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

    const notificationPayload = {
      app_id: ONESIGNAL_APP_ID,
      included_segments: ["All"], // Adjust as needed (e.g., specific tags or user segments)
      headings: { en: "New Product Alert!" },
      contents: { en: message },
      url: productData.url || "https://your-app-url.com/products",
    };

    try {
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
    } catch (error) {
      console.error("Error sending notification:", error);
    }
  });
