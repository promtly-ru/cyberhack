import { FirmwareModal } from '../components/firmware/FirmwareModal';
import { AchievementsScreen } from '../screens/AchievementsScreen';
import { FirmwareRewardScreen } from '../screens/FirmwareReward';

/** Все окна прошивок/достижений; монтируется один раз в App. */
export function UiOverlays() {
  return (
    <>
      <FirmwareModal />
      <AchievementsScreen />
      <FirmwareRewardScreen />
    </>
  );
}
