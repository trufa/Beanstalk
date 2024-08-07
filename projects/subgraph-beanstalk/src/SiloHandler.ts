import { Address, BigInt, ethereum, log } from "@graphprotocol/graph-ts";
import {
  AddDeposit,
  StalkBalanceChanged,
  SeedsBalanceChanged,
  AddWithdrawal,
  RemoveDeposit,
  RemoveDeposits,
  RemoveWithdrawal,
  RemoveWithdrawals,
  Plant,
  WhitelistToken,
  DewhitelistToken
} from "../generated/Beanstalk-ABIs/MarketV2";
import {
  AddDeposit as AddDeposit_V3,
  RemoveDeposit as RemoveDeposit_V3,
  RemoveDeposits as RemoveDeposits_V3,
  UpdatedStalkPerBdvPerSeason,
  WhitelistToken as WhitelistToken_V3
} from "../generated/Beanstalk-ABIs/SiloV3";
import { Replanted, TransferDepositCall, TransferDepositsCall } from "../generated/Beanstalk-ABIs/Replanted";
import { ZERO_BI } from "../../subgraph-core/utils/Decimals";
import {
  loadSilo,
  loadSiloAsset,
  loadSiloAssetDailySnapshot,
  loadSiloAssetHourlySnapshot,
  loadSiloWithdraw,
  loadSiloDeposit,
  loadWhitelistTokenSetting,
  loadWhitelistTokenHourlySnapshot,
  loadWhitelistTokenDailySnapshot,
  addToSiloWhitelist,
  updateDeposit
} from "./utils/Silo";
import { WhitelistToken as WhitelistTokenEntity, DewhitelistToken as DewhitelistTokenEntity, SiloDeposit, Silo } from "../generated/schema";
import { getCurrentSeason, loadBeanstalk, loadFarmer } from "./utils/Beanstalk";
import { BEANSTALK, BEAN_ERC20, GAUGE_BIP45_BLOCK } from "../../subgraph-core/utils/Constants";
import { takeSiloSnapshots } from "./utils/snapshots/Silo";

class AddRemoveDepositsParams {
  event: ethereum.Event;
  account: Address;
  token: Address;
  seasons: BigInt[] | null; // Seasons not present in v3+
  stems: BigInt[] | null; // Stems not present in v2
  amounts: BigInt[];
  bdvs: BigInt[] | null; // bdv not present in v2
  depositVersion: String;
}

function addDeposits(params: AddRemoveDepositsParams): void {
  let currentSeason = getCurrentSeason(params.event.address);
  for (let i = 0; i < params.amounts.length; ++i) {
    let deposit = loadSiloDeposit({
      account: params.account,
      token: params.token,
      depositVersion: params.depositVersion,
      season: params.seasons != null ? params.seasons![i] : null,
      stem: params.stems != null ? params.stems![i] : null
    });

    // Set granular deposit version type
    if (params.depositVersion == "season") {
      deposit.depositVersion = "season";
      // TODO: fill stem according to seasonToStem
    } else {
      deposit.depositVersion = params.event.block.number > GAUGE_BIP45_BLOCK ? "v3.1" : "v3";
    }

    updateDeposit(deposit, params.amounts[i], params.bdvs![i], params.event);
    deposit.save();

    // TODO: these add/remove deposit to silo methods should be refactored such that it only needs to be called
    // at the farmer level, and that will recur on the system level (only when called for farmer).
    // In that case, the addDepositToSiloAsset method should not need to be called here, it can be called in the
    // underlying method. I believe it needs to be refactored also

    // Ensure that a Farmer entity is set up for this account.
    loadFarmer(params.account);

    // Update overall silo totals
    addDepositToSilo(
      params.event.address,
      currentSeason,
      params.bdvs![i],
      addDepositToSiloAsset(
        params.event.address,
        params.token,
        currentSeason,
        params.bdvs![i],
        params.amounts[i],
        params.event.block.timestamp,
        params.event.block.number
      ),
      params.event.block.timestamp,
      params.event.block.number
    );

    // Update farmer silo totals
    addDepositToSilo(
      params.account,
      currentSeason,
      params.bdvs![i],
      addDepositToSiloAsset(
        params.account,
        params.token,
        currentSeason,
        params.bdvs![i],
        params.amounts[i],
        params.event.block.timestamp,
        params.event.block.number
      ),
      params.event.block.timestamp,
      params.event.block.number
    );
  }
}

function removeDeposits(params: AddRemoveDepositsParams): void {
  let currentSeason = getCurrentSeason(params.event.address);
  for (let i = 0; i < params.amounts.length; ++i) {
    let deposit = loadSiloDeposit({
      account: params.account,
      token: params.token,
      depositVersion: params.depositVersion,
      season: params.seasons != null ? params.seasons![i] : null,
      stem: params.stems != null ? params.stems![i] : null
    });

    // Use bdv if it was provided (v2 events dont provide bdv), otherwise infer
    let removedBdv = params.bdvs != null ? params.bdvs![i] : params.amounts[i].times(deposit.depositedBDV).div(deposit.depositedAmount);

    // TODO: if amount goes to zero, instead delete the deposit entirely.
    updateDeposit(deposit, params.amounts[i].neg(), removedBdv.neg(), params.event);
    deposit.save();

    // Update protocol totals
    removeDepositFromSilo(
      params.event.address,
      currentSeason,
      removedBdv,
      removeDepositFromSiloAsset(
        params.event.address,
        params.token,
        currentSeason,
        removedBdv,
        params.amounts[i],
        params.event.block.timestamp,
        params.event.block.number
      ),
      params.event.block.timestamp,
      params.event.block.number
    );

    // Update farmer totals
    removeDepositFromSilo(
      params.account,
      currentSeason,
      removedBdv,
      removeDepositFromSiloAsset(
        params.account,
        params.token,
        currentSeason,
        removedBdv,
        params.amounts[i],
        params.event.block.timestamp,
        params.event.block.number
      ),
      params.event.block.timestamp,
      params.event.block.number
    );
  }
}

/**
 * SILO V2 (REPLANT) HANDLERS
 */

export function handleAddDeposit(event: AddDeposit): void {
  addDeposits({
    event,
    account: event.params.account,
    token: event.params.token,
    seasons: [event.params.season],
    stems: null,
    amounts: [event.params.amount],
    bdvs: [event.params.bdv],
    depositVersion: "season"
  });
}

export function handleRemoveDeposit(event: RemoveDeposit): void {
  removeDeposits({
    event,
    account: event.params.account,
    token: event.params.token,
    seasons: [event.params.season],
    stems: null,
    amounts: [event.params.amount],
    bdvs: null,
    depositVersion: "season"
  });
}

export function handleRemoveDeposits(event: RemoveDeposits): void {
  removeDeposits({
    event,
    account: event.params.account,
    token: event.params.token,
    seasons: event.params.seasons,
    stems: null,
    amounts: event.params.amounts,
    bdvs: null,
    depositVersion: "season"
  });
}

export function handleAddWithdrawal(event: AddWithdrawal): void {
  let withdraw = loadSiloWithdraw(event.params.account, event.params.token, event.params.season.toI32());
  withdraw.amount = withdraw.amount.plus(event.params.amount);
  withdraw.createdAt = withdraw.createdAt == ZERO_BI ? event.block.timestamp : withdraw.createdAt;
  withdraw.save();

  addWithdrawToSiloAsset(
    event.address,
    event.params.token,
    event.params.season.toI32(),
    event.params.amount,
    event.block.timestamp,
    event.block.number
  );
  addWithdrawToSiloAsset(
    event.params.account,
    event.params.token,
    event.params.season.toI32(),
    event.params.amount,
    event.block.timestamp,
    event.block.number
  );
}

export function handleRemoveWithdrawal(event: RemoveWithdrawal): void {
  updateClaimedWithdraw(event.params.account, event.params.token, event.params.season);
}

export function handleRemoveWithdrawals(event: RemoveWithdrawals): void {
  for (let i = 0; i < event.params.seasons.length; i++) {
    updateClaimedWithdraw(event.params.account, event.params.token, event.params.seasons[i]);
  }
}

/**
 * SILO V3 HANDLERS
 */

export function handleAddDeposit_V3(event: AddDeposit_V3): void {
  addDeposits({
    event,
    account: event.params.account,
    token: event.params.token,
    seasons: null,
    stems: [event.params.stem],
    amounts: [event.params.amount],
    bdvs: [event.params.bdv],
    depositVersion: "stem"
  });
}

export function handleRemoveDeposit_V3(event: RemoveDeposit_V3): void {
  removeDeposits({
    event,
    account: event.params.account,
    token: event.params.token,
    seasons: null,
    stems: [event.params.stem],
    amounts: [event.params.amount],
    bdvs: [event.params.bdv],
    depositVersion: "stem"
  });
}

export function handleRemoveDeposits_V3(event: RemoveDeposits_V3): void {
  removeDeposits({
    event,
    account: event.params.account,
    token: event.params.token,
    seasons: null,
    stems: event.params.stems,
    amounts: event.params.amounts,
    bdvs: event.params.bdvs,
    depositVersion: "stem"
  });
}

export function handleStalkBalanceChanged(event: StalkBalanceChanged): void {
  // Exclude BIP-24 emission of missed past events
  if (event.transaction.hash.toHexString() == "0xa89638aeb0d6c4afb4f367ea7a806a4c8b3b2a6eeac773e8cc4eda10bfa804fc") {
    return;
  }

  let beanstalk = loadBeanstalk(event.address); // get current season
  updateStalkBalances(
    event.address,
    beanstalk.lastSeason,
    event.params.delta,
    event.params.deltaRoots,
    event.block.timestamp,
    event.block.number
  );
  updateStalkBalances(
    event.params.account,
    beanstalk.lastSeason,
    event.params.delta,
    event.params.deltaRoots,
    event.block.timestamp,
    event.block.number
  );
}

export function handleSeedsBalanceChanged(event: SeedsBalanceChanged): void {
  // Exclude BIP-24 emission of missed past events
  if (event.transaction.hash.toHexString() == "0xa89638aeb0d6c4afb4f367ea7a806a4c8b3b2a6eeac773e8cc4eda10bfa804fc") {
    return;
  }

  updateSeedsBalances(event.address, event.params.account, event.params.delta, event.block.timestamp);
}

export function handlePlant(event: Plant): void {
  // This removes the plantable stalk for planted beans.
  // Actual stalk credit for the farmer will be handled under the StalkBalanceChanged event.

  const currentSeason = getCurrentSeason(event.address);
  let silo = loadSilo(event.address);
  let newPlantableStalk = event.params.beans.times(BigInt.fromI32(10000));

  silo.plantableStalk = silo.plantableStalk.minus(newPlantableStalk);
  silo.depositedBDV = silo.depositedBDV.minus(event.params.beans);

  takeSiloSnapshots(silo, event.address, event.block.timestamp);
  silo.save();

  // Remove the asset-only amount that got added in Reward event handler.
  // Will be immediately re-credited to the user/system in AddDeposit
  removeDepositFromSiloAsset(
    event.address,
    BEAN_ERC20,
    currentSeason,
    event.params.beans,
    event.params.beans,
    event.block.timestamp,
    event.block.number
  );
}

// These two calls are according to the Replant abi, before stems were included.
// They are not in use anymore and therefore it is unclear whether or not they are actually needed.
export function handleTransferDepositCall(call: TransferDepositCall): void {
  let beanstalk = loadBeanstalk(BEANSTALK);
  let updateFarmers = beanstalk.farmersToUpdate;
  if (updateFarmers.indexOf(call.from.toHexString()) == -1) updateFarmers.push(call.from.toHexString());
  if (updateFarmers.indexOf(call.inputs.recipient.toHexString()) == -1) updateFarmers.push(call.inputs.recipient.toHexString());
  beanstalk.farmersToUpdate = updateFarmers;
  beanstalk.save();
}

export function handleTransferDepositsCall(call: TransferDepositsCall): void {
  let beanstalk = loadBeanstalk(BEANSTALK);
  let updateFarmers = beanstalk.farmersToUpdate;
  if (updateFarmers.indexOf(call.from.toHexString()) == -1) updateFarmers.push(call.from.toHexString());
  if (updateFarmers.indexOf(call.inputs.recipient.toHexString()) == -1) updateFarmers.push(call.inputs.recipient.toHexString());
  beanstalk.farmersToUpdate = updateFarmers;
  beanstalk.save();
}

// TODO: consider consolidating both add/remove deposit methods here
function addDepositToSilo(
  account: Address,
  season: i32,
  bdv: BigInt,
  grownStalkPerBDV: BigInt,
  timestamp: BigInt,
  blockNumber: BigInt
): void {
  let silo = loadSilo(account);

  silo.depositedBDV = silo.depositedBDV.plus(bdv);
  // Individual farmer seeds cannot be directly tracked due to seed gauge
  if (account == BEANSTALK) {
    silo.grownStalkPerSeason = silo.grownStalkPerSeason.plus(grownStalkPerBDV);
  }
  takeSiloSnapshots(silo, BEANSTALK, timestamp);
  silo.save();
}

function removeDepositFromSilo(
  account: Address,
  season: i32,
  bdv: BigInt,
  grownStalkPerBDV: BigInt,
  timestamp: BigInt,
  blockNumber: BigInt
): void {
  let silo = loadSilo(account);

  silo.depositedBDV = silo.depositedBDV.minus(bdv);
  // Individual farmer seeds cannot be directly tracked due to seed gauge
  // TODO: event originator in method signature (required for recursion also)
  if (account == BEANSTALK) {
    silo.grownStalkPerSeason = silo.grownStalkPerSeason.minus(grownStalkPerBDV);
  }
  takeSiloSnapshots(silo, BEANSTALK, timestamp);
  silo.save();
}

export function addDepositToSiloAsset(
  account: Address,
  token: Address,
  season: i32,
  bdv: BigInt,
  amount: BigInt,
  timestamp: BigInt,
  blockNumber: BigInt
): BigInt {
  let asset = loadSiloAsset(account, token);
  let assetHourly = loadSiloAssetHourlySnapshot(account, token, season, timestamp);
  let assetDaily = loadSiloAssetDailySnapshot(account, token, timestamp);

  let tokenSettings = loadWhitelistTokenSetting(token);
  let newGrownStalk = bdv.times(tokenSettings.stalkEarnedPerSeason).div(BigInt.fromI32(1000000));

  asset.depositedBDV = asset.depositedBDV.plus(bdv);
  asset.depositedAmount = asset.depositedAmount.plus(amount);
  asset.save();

  assetHourly.deltaDepositedBDV = assetHourly.deltaDepositedBDV.plus(bdv);
  assetHourly.depositedBDV = asset.depositedBDV;
  assetHourly.deltaDepositedAmount = assetHourly.deltaDepositedAmount.plus(amount);
  assetHourly.depositedAmount = asset.depositedAmount;
  assetHourly.updatedAt = timestamp;
  assetHourly.save();

  assetDaily.season = season;
  assetDaily.deltaDepositedBDV = assetDaily.deltaDepositedBDV.plus(bdv);
  assetDaily.depositedBDV = asset.depositedBDV;
  assetDaily.deltaDepositedAmount = assetDaily.deltaDepositedAmount.plus(amount);
  assetDaily.depositedAmount = asset.depositedAmount;
  assetDaily.updatedAt = timestamp;
  assetDaily.save();

  return newGrownStalk;
}

function removeDepositFromSiloAsset(
  account: Address,
  token: Address,
  season: i32,
  bdv: BigInt,
  amount: BigInt,
  timestamp: BigInt,
  blockNumber: BigInt
): BigInt {
  let asset = loadSiloAsset(account, token);
  let assetHourly = loadSiloAssetHourlySnapshot(account, token, season, timestamp);
  let assetDaily = loadSiloAssetDailySnapshot(account, token, timestamp);

  let tokenSettings = loadWhitelistTokenSetting(token);
  let removedGrownStalk = bdv.times(tokenSettings.stalkEarnedPerSeason).div(BigInt.fromI32(1000000));

  asset.depositedBDV = asset.depositedBDV.minus(bdv);
  asset.depositedAmount = asset.depositedAmount.minus(amount);
  asset.save();

  assetHourly.deltaDepositedBDV = assetHourly.deltaDepositedBDV.minus(bdv);
  assetHourly.depositedBDV = asset.depositedBDV;
  assetHourly.deltaDepositedAmount = assetHourly.deltaDepositedAmount.minus(amount);
  assetHourly.depositedAmount = asset.depositedAmount;
  assetHourly.updatedAt = timestamp;
  assetHourly.save();

  assetDaily.season = season;
  assetDaily.deltaDepositedBDV = assetDaily.deltaDepositedBDV.minus(bdv);
  assetDaily.depositedBDV = asset.depositedBDV;
  assetDaily.deltaDepositedAmount = assetDaily.deltaDepositedAmount.minus(amount);
  assetDaily.depositedAmount = asset.depositedAmount;
  assetDaily.updatedAt = timestamp;
  assetDaily.save();

  return removedGrownStalk;
}

function addWithdrawToSiloAsset(
  account: Address,
  token: Address,
  season: i32,
  amount: BigInt,
  timestamp: BigInt,
  blockNumber: BigInt
): void {
  let assetHourly = loadSiloAssetHourlySnapshot(account, token, season, timestamp);
  let assetDaily = loadSiloAssetDailySnapshot(account, token, timestamp);

  assetHourly.deltaWithdrawnAmount = assetHourly.deltaWithdrawnAmount.plus(amount);
  assetHourly.updatedAt = timestamp;
  assetHourly.save();

  assetDaily.season = season;
  assetDaily.deltaWithdrawnAmount = assetDaily.deltaWithdrawnAmount.plus(amount);
  assetDaily.updatedAt = timestamp;
  assetDaily.save();
}

export function updateStalkBalances(
  account: Address,
  season: i32,
  stalk: BigInt,
  roots: BigInt,
  timestamp: BigInt,
  blockNumber: BigInt
): void {
  let silo = loadSilo(account);

  silo.stalk = silo.stalk.plus(stalk);
  silo.roots = silo.roots.plus(roots);

  // TODO: protocol in param
  takeSiloSnapshots(silo, BEANSTALK, timestamp);

  // Add account to active list if needed
  if (account !== BEANSTALK) {
    let beanstalk = loadBeanstalk(BEANSTALK);
    let farmerIndex = beanstalk.activeFarmers.indexOf(account.toHexString());
    if (farmerIndex == -1) {
      let newFarmers = beanstalk.activeFarmers;
      newFarmers.push(account.toHexString());
      beanstalk.activeFarmers = newFarmers;
      beanstalk.save();
      silo.activeFarmers += 1;
    } else if (silo.stalk == ZERO_BI) {
      let newFarmers = beanstalk.activeFarmers;
      newFarmers.splice(farmerIndex, 1);
      beanstalk.activeFarmers = newFarmers;
      beanstalk.save();
      silo.activeFarmers -= 1;
    }
  }
  silo.save();
}

function updateSeedsBalances(beanstalk: Address, account: Address, seeds: BigInt, timestamp: BigInt, recurs: Boolean = true): void {
  if (recurs && account != beanstalk) {
    updateSeedsBalances(beanstalk, beanstalk, seeds, timestamp);
  }
  let silo = loadSilo(account);
  silo.seeds = silo.seeds.plus(seeds);
  takeSiloSnapshots(silo, beanstalk, timestamp);
  silo.save();
}

function updateClaimedWithdraw(account: Address, token: Address, season: BigInt): void {
  let withdraw = loadSiloWithdraw(account, token, season.toI32());
  withdraw.claimed = true;
  withdraw.save();
}

export function updateStalkWithCalls(beanstalkAddress: Address, season: i32, timestamp: BigInt, blockNumber: BigInt): void {
  // This should be run at sunrise for the previous season to update any farmers stalk/seed/roots balances from silo transfers.

  let beanstalk = loadBeanstalk(beanstalkAddress);
  let beanstalk_call = Replanted.bind(beanstalkAddress);

  for (let i = 0; i < beanstalk.farmersToUpdate.length; i++) {
    let account = Address.fromString(beanstalk.farmersToUpdate[i]);
    let silo = loadSilo(account);
    updateStalkBalances(
      account,
      season,
      beanstalk_call.balanceOfStalk(account).minus(silo.stalk),
      beanstalk_call.balanceOfRoots(account).minus(silo.roots),
      timestamp,
      blockNumber
    );
    // balanceOfSeeds function was removed in silov2
    updateSeedsBalances(beanstalkAddress, account, beanstalk_call.balanceOfSeeds(account).minus(silo.seeds), timestamp, false);
  }
  beanstalk.farmersToUpdate = [];
  beanstalk.save();
}

export function handleWhitelistToken(event: WhitelistToken): void {
  addToSiloWhitelist(event.address, event.params.token);

  let setting = loadWhitelistTokenSetting(event.params.token);
  setting.selector = event.params.selector;
  setting.stalkIssuedPerBdv = BigInt.fromString("10000000000");
  setting.stalkEarnedPerSeason = event.params.stalk.times(BigInt.fromI32(1000000));
  setting.save();

  loadWhitelistTokenHourlySnapshot(event.params.token, getCurrentSeason(event.address), event.block.timestamp);
  loadWhitelistTokenDailySnapshot(event.params.token, event.block.timestamp);

  let id = "whitelistToken-" + event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let rawEvent = new WhitelistTokenEntity(id);
  rawEvent.hash = event.transaction.hash.toHexString();
  rawEvent.logIndex = event.logIndex.toI32();
  rawEvent.protocol = event.address.toHexString();
  rawEvent.token = event.params.token.toHexString();
  rawEvent.stalk = event.params.stalk;
  rawEvent.seeds = event.params.seeds;
  rawEvent.selector = event.params.selector.toHexString();
  rawEvent.blockNumber = event.block.number;
  rawEvent.createdAt = event.block.timestamp;
  rawEvent.save();
}

export function handleWhitelistToken_V3(event: WhitelistToken_V3): void {
  addToSiloWhitelist(event.address, event.params.token);

  let setting = loadWhitelistTokenSetting(event.params.token);
  setting.selector = event.params.selector;
  setting.stalkIssuedPerBdv = event.params.stalk.times(BigInt.fromI32(1_000_000));
  setting.stalkEarnedPerSeason = event.params.stalkEarnedPerSeason;
  setting.save();

  loadWhitelistTokenHourlySnapshot(event.params.token, getCurrentSeason(event.address), event.block.timestamp);
  loadWhitelistTokenDailySnapshot(event.params.token, event.block.timestamp);

  let id = "whitelistToken-" + event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let rawEvent = new WhitelistTokenEntity(id);
  rawEvent.hash = event.transaction.hash.toHexString();
  rawEvent.logIndex = event.logIndex.toI32();
  rawEvent.protocol = event.address.toHexString();
  rawEvent.token = event.params.token.toHexString();
  rawEvent.stalk = event.params.stalk;
  rawEvent.seeds = ZERO_BI;
  rawEvent.stalkPerSeason = event.params.stalkEarnedPerSeason;
  rawEvent.selector = event.params.selector.toHexString();
  rawEvent.blockNumber = event.block.number;
  rawEvent.createdAt = event.block.timestamp;
  rawEvent.save();
}
// V4 whitelist for seed gauge is in GaugeHandler

export function handleDewhitelistToken(event: DewhitelistToken): void {
  let silo = loadSilo(event.address);
  let currentWhitelist = silo.whitelistedTokens;
  let currentDewhitelist = silo.dewhitelistedTokens;
  let index = currentWhitelist.indexOf(event.params.token.toHexString());
  if (index >= 0) {
    currentDewhitelist.push(currentWhitelist.splice(index, 1)[0]);
    silo.whitelistedTokens = currentWhitelist;
    silo.dewhitelistedTokens = currentDewhitelist;
    silo.save();
  }

  let id = "dewhitelistToken-" + event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let rawEvent = new DewhitelistTokenEntity(id);
  rawEvent.hash = event.transaction.hash.toHexString();
  rawEvent.logIndex = event.logIndex.toI32();
  rawEvent.protocol = event.address.toHexString();
  rawEvent.token = event.params.token.toHexString();
  rawEvent.blockNumber = event.block.number;
  rawEvent.createdAt = event.block.timestamp;
  rawEvent.save();
}

export function handleUpdatedStalkPerBdvPerSeason(event: UpdatedStalkPerBdvPerSeason): void {
  let siloSettings = loadWhitelistTokenSetting(event.params.token);
  siloSettings.milestoneSeason = event.params.season.toI32();
  siloSettings.stalkEarnedPerSeason = event.params.stalkEarnedPerSeason;
  siloSettings.updatedAt = event.block.timestamp;
  siloSettings.save();

  let hourly = loadWhitelistTokenHourlySnapshot(event.params.token, event.params.season.toI32(), event.block.timestamp);
  hourly.milestoneSeason = siloSettings.milestoneSeason;
  hourly.stalkEarnedPerSeason = siloSettings.stalkEarnedPerSeason;
  hourly.save();

  let daily = loadWhitelistTokenDailySnapshot(event.params.token, event.block.timestamp);
  daily.milestoneSeason = siloSettings.milestoneSeason;
  daily.stalkEarnedPerSeason = siloSettings.stalkEarnedPerSeason;
  daily.save();
}
