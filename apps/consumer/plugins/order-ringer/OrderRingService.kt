// Copied into the Android app by plugins/with-order-ringer.js; the package line is filled in there.
package __PACKAGE__

import android.app.ActivityManager
import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.util.Log
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

/**
 * Rings a shop phone like an incoming call when a new order arrives, even if the app was swiped away.
 *
 * Every push still goes through expo-notifications as before, except a shop's new-order push (and its
 * 2-minute reminder) while the app isn't on screen: the server marks those ring = "1". This posts
 * them on the "order-ring" channel with FLAG_INSISTENT, so the alarm sound and buzz repeat until
 * someone taps the notification or pulls down the shade, and stop by themselves at ringUntil, when
 * the order would be dropped. Opening the app clears it (src/lib/push.ts), and the in-app ring
 * takes over while the orders board is open.
 *
 * Firebase wakes the app for these high-priority data messages unless it was force-stopped.
 */
class OrderRingService : ExpoFirebaseMessagingService() {

  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
    if (data["ring"] != "1" || appIsOnScreen()) {
      super.onMessageReceived(remoteMessage)
      return
    }
    try {
      ring(data)
    } catch (e: Exception) {
      // Never lose an order: fall back to the ordinary notification.
      Log.w(TAG, "Could not ring for a new order", e)
      super.onMessageReceived(remoteMessage)
    }
  }

  /** True when someone is looking at the app: the orders board rings and shows the banner itself. */
  private fun appIsOnScreen(): Boolean {
    val state = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(state)
    val locked = (getSystemService(KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
    return state.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND && !locked
  }

  private fun ring(data: Map<String, String>) {
    val left = (data["ringUntil"]?.toLongOrNull() ?: (System.currentTimeMillis() + DEFAULT_RING_MS)) -
      System.currentTimeMillis()
    // Already dropped by the server: nothing left to answer.
    if (left <= 0) return

    val manager = getSystemService(NotificationManager::class.java)
    val sound = Uri.parse("android.resource://$packageName/raw/new_order")
    // Alarm volume, so it rings with the phone on silent, like the ring inside the app.
    val audio = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      // Android fixes a channel's sound once it exists, so this is created only once.
      if (manager.getNotificationChannel(CHANNEL) == null) {
        manager.createNotificationChannel(
          NotificationChannel(CHANNEL, "Incoming orders (ring until answered)", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Rings like a call when a new order arrives and the app is closed, until you open it."
            setSound(sound, audio)
            enableVibration(true)
            vibrationPattern = BUZZ
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
          },
        )
      }
      Notification.Builder(this, CHANNEL).setTimeoutAfter(left)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
        .setPriority(Notification.PRIORITY_MAX)
        .setSound(sound, audio)
        .setVibrate(BUZZ)
    }

    val orderId = data["orderId"].orEmpty()
    // Opens the orders board (expo-router handles the link, signed in or not).
    val open = Intent(Intent.ACTION_VIEW, Uri.parse("campuscart://partner"))
      .setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val tap = PendingIntent.getActivity(
      this,
      orderId.hashCode(),
      open,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val icon = resources.getIdentifier("notification_icon", "drawable", packageName)
      .takeIf { it != 0 } ?: applicationInfo.icon
    val notification = builder
      .setSmallIcon(icon)
      .setColor(GREEN)
      .setContentTitle(data["title"])
      .setContentText(data["message"])
      .setStyle(Notification.BigTextStyle().bigText(data["message"]))
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setContentIntent(tap)
      .addAction(Notification.Action.Builder(null, "Open orders", tap).build())
      .setAutoCancel(true)
      // Like a call: it can't be swiped away, only answered (or it stops when the order is dropped).
      .setOngoing(true)
      .build()
    notification.flags = notification.flags or Notification.FLAG_INSISTENT

    // One per order; the 2-minute reminder replaces it and rings again. Id 0 with a tag is how
    // expo-notifications posts too, so Notifications.dismissAllNotificationsAsync clears these.
    manager.notify("$TAG_PREFIX$orderId", 0, notification)
  }

  companion object {
    private const val TAG = "OrderRingService"
    private const val CHANNEL = "order-ring"
    private const val TAG_PREFIX = "order-ring:"
    private const val DEFAULT_RING_MS = 7 * 60 * 1000L
    private const val GREEN = 0xFF1A9E4B.toInt()
    private val BUZZ = longArrayOf(0, 700, 300, 700, 300, 700)
  }
}
