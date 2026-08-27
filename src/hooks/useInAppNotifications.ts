import { InAppNotification } from '../types';
import { useInAppNotificationsContext } from '../context/NotificationContext';

export { InAppNotification };

export function useInAppNotifications() {
  return useInAppNotificationsContext();
}
