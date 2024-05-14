import { BEANSTALK } from "../../../subgraph-core/utils/Constants";
import { loadBeanstalk } from "../../src/utils/Beanstalk";

export function setSeason(season: u32): void {
  let beanstalk = loadBeanstalk(BEANSTALK);
  beanstalk.lastSeason = season;
  beanstalk.save();
}
