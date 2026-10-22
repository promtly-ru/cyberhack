import { FirmwareModal } from '../components/firmware/FirmwareModal';
import { AchievementsScreen } from '../screens/AchievementsScreen';

/** Все окна прошивок/достижений; монтируется один раз в App. */
export function UiOverlays() {
  return (
    <>
      <FirmwareModal />
      <AchievementsScreen />
    </>
  );
}
