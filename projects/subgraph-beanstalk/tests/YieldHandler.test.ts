import { BigInt, BigDecimal, log, Bytes } from "@graphprotocol/graph-ts";
import { afterEach, assert, clearStore, describe, test } from "matchstick-as/assembly/index";
import * as YieldHandler from "../src/YieldHandler";
import { ZERO_BD, ZERO_BI } from "../../subgraph-core/utils/Decimals";
import { loadSilo, loadSiloAsset, loadSiloYield, loadTokenYield, loadWhitelistTokenSetting } from "../src/utils/SiloEntities";
import { BEAN_3CRV, BEAN_ERC20, BEAN_WETH_CP2_WELL, BEANSTALK, UNRIPE_BEAN, UNRIPE_BEAN_3CRV } from "../../subgraph-core/utils/Constants";
import { setSeason } from "./event-mocking/Season";

describe("APY Calculations", () => {
  describe("Pre-Gauge", () => {
    test("No Bean mints", () => {
      const apy = YieldHandler.calculateAPYPreGauge(
        BigDecimal.fromString("0"), // n
        BigDecimal.fromString("2"), // seedsPerBDV
        BigDecimal.fromString("2"), // seedsPerBeanBDV
        BigInt.fromString("10000000000000"), // stalk
        BigInt.fromString("2000000000") // seeds
      );

      log.info(`bean apy: {}`, [apy[0].toString()]);
      log.info(`stalk apy: {}`, [apy[1].toString()]);
      assert.assertTrue((apy[0] as BigDecimal).equals(BigDecimal.fromString("0")));
      assert.assertTrue((apy[1] as BigDecimal).gt(BigDecimal.fromString("0")));
    });

    // Sequence recreated here for testing:
    // https://docs.google.com/spreadsheets/d/1h7pPEydeAMze_uZMZzodTB3kvEXz_dGGje4KKm83gRM/edit#gid=1845553589
    test("Yields are higher with 4 seeds", () => {
      const apy2 = YieldHandler.calculateAPYPreGauge(
        BigDecimal.fromString("1"),
        BigDecimal.fromString("2"),
        BigDecimal.fromString("2"),
        BigInt.fromString("10000000000000"),
        BigInt.fromString("2000000000")
      );
      const apy4 = YieldHandler.calculateAPYPreGauge(
        BigDecimal.fromString("1"),
        BigDecimal.fromString("4"),
        BigDecimal.fromString("4"),
        BigInt.fromString("10000000000000"),
        BigInt.fromString("2000000000")
      );

      log.info(`bean apy (2 seeds): {}`, [(apy2[0] as BigDecimal).toString()]);
      log.info(`bean apy (4 seeds): {}`, [(apy4[0] as BigDecimal).toString()]);
      log.info(`stalk apy (2 seeds): {}`, [(apy2[1] as BigDecimal).toString()]);
      log.info(`stalk apy (4 seeds): {}`, [(apy4[1] as BigDecimal).toString()]);
      assert.assertTrue((apy4[0] as BigDecimal).gt(apy2[0] as BigDecimal));
      assert.assertTrue((apy4[1] as BigDecimal).gt(apy2[1] as BigDecimal));
    });
  });

  describe("With Seed Gauge", () => {
    test("Token yields - direct calculation", () => {
      // return;
      // Calculated in a single call - 5000 ms
      // using non-gauge bdv 19556945 + 24417908 + 164986 (Unripe + 3crv after dewhitelisted)
      const apy = YieldHandler.calculateGaugeVAPYs(
        [-1, 0, -2],
        BigDecimal.fromString("100"),
        [BigDecimal.fromString("100")],
        [BigDecimal.fromString("899088")],
        BigDecimal.fromString("44139839"),
        [BigDecimal.fromString("100")],
        BigDecimal.fromString("0.33"),
        BigDecimal.fromString("2798474"),
        BigDecimal.fromString("161540879"),
        BigDecimal.fromString("4320"),
        ZERO_BI,
        [ZERO_BD, ZERO_BD],
        [[ZERO_BD, ZERO_BD]],
        [ZERO_BD, ZERO_BD],
        [null, null, ZERO_BD]
      );

      for (let i = 0; i < apy.length; ++i) {
        log.info(`bean apy: {}`, [(apy[i][0] as BigDecimal).toString()]);
        log.info(`stalk apy: {}`, [(apy[i][1] as BigDecimal).toString()]);
      }

      // Bean apy
      assert.assertTrue(apy[0][0].equals(BigDecimal.fromString("1.54644190080929820744293897629")));
      assert.assertTrue(apy[0][1].equals(BigDecimal.fromString("431.437897488823610478263760573224")));

      // Calculated separately - 8750ms
      // for (let i = -1; i <= 0; ++i) {
      //   const apy = YieldHandler.calculateGaugeVAPYs(
      //     [i],
      //     BigDecimal.fromString("100"),
      //     [BigDecimal.fromString("100")],
      //     [BigDecimal.fromString("899088")],
      //     BigDecimal.fromString("43974853"),
      //     [BigDecimal.fromString("100")],
      //     BigDecimal.fromString("0.33"),
      //     BigDecimal.fromString("2798474"),
      //     BigDecimal.fromString("161540879"),
      //     BigDecimal.fromString("4320"),
      //     ZERO_BI,
      //     [ZERO_BD, ZERO_BD],
      //     [[ZERO_BD], [ZERO_BD]],
      //     [ZERO_BD, ZERO_BD],
      //     [null]
      //   );

      //   log.info(`bean apy: {}`, [(apy[0][0] as BigDecimal).toString()]);
      //   log.info(`stalk apy: {}`, [(apy[0][1] as BigDecimal).toString()]);
      // }

      // const apyUnripe = YieldHandler.calculateGaugeVAPYs(
      //   [-2],
      //   BigDecimal.fromString("100"),
      //   [BigDecimal.fromString("100")],
      //   [BigDecimal.fromString("899088")],
      //   BigDecimal.fromString("43974853"),
      //   [BigDecimal.fromString("100")],
      //   BigDecimal.fromString("0.33"),
      //   BigDecimal.fromString("2798474"),
      //   BigDecimal.fromString("161540879"),
      //   BigDecimal.fromString("4320"),
      //   ZERO_BI,
      //   [ZERO_BD, ZERO_BD],
      //   [[ZERO_BD], [ZERO_BD]],
      //   [ZERO_BD, ZERO_BD],
      //   [ZERO_BD]
      // );

      // log.info(`bean apy: {}`, [(apyUnripe[0][0] as BigDecimal).toString()]);
      // log.info(`stalk apy: {}`, [(apyUnripe[0][1] as BigDecimal).toString()]);
    });

    test("Token yields - entity calculation", () => {
      // Set up the required entities for the calculation to have access to the required values
      let silo = loadSilo(BEANSTALK);
      silo.stalk = BigInt.fromString("161540879000000");
      silo.beanToMaxLpGpPerBdvRatio = BigInt.fromString("33000000000000000000");
      silo.save();

      setSeason(20000);

      /// Whitelist/gauge/seed settings
      let beanWhitelistSettings = loadWhitelistTokenSetting(BEAN_ERC20);
      // Nothing needs to be set for bean
      beanWhitelistSettings.save();

      let beanEthWhitelistSettings = loadWhitelistTokenSetting(BEAN_WETH_CP2_WELL);
      beanEthWhitelistSettings.gaugePoints = BigInt.fromString("100000000000000000000");
      beanEthWhitelistSettings.gpSelector = Bytes.fromHexString("0x12345678");
      beanEthWhitelistSettings.lwSelector = Bytes.fromHexString("0x12345678");
      beanEthWhitelistSettings.optimalPercentDepositedBdv = BigInt.fromString("100000000");
      beanEthWhitelistSettings.save();

      let urbeanWhitelistSettings = loadWhitelistTokenSetting(UNRIPE_BEAN);
      urbeanWhitelistSettings.stalkEarnedPerSeason = ZERO_BI;
      urbeanWhitelistSettings.save();

      let urlpWhitelistSettings = loadWhitelistTokenSetting(UNRIPE_BEAN_3CRV);
      urlpWhitelistSettings.stalkEarnedPerSeason = ZERO_BI;
      urlpWhitelistSettings.save();

      /// Deposited BDVs
      let beanSiloAsset = loadSiloAsset(BEANSTALK, BEAN_ERC20);
      beanSiloAsset.depositedBDV = BigInt.fromString("2798474000000");
      beanSiloAsset.save();

      let beanEthSiloAsset = loadSiloAsset(BEANSTALK, BEAN_WETH_CP2_WELL);
      beanEthSiloAsset.depositedBDV = BigInt.fromString("899088000000");
      beanEthSiloAsset.save();

      let bean3crvSiloAsset = loadSiloAsset(BEANSTALK, BEAN_3CRV);
      bean3crvSiloAsset.depositedBDV = BigInt.fromString("164986000000");
      bean3crvSiloAsset.save();

      let urbeanSiloAsset = loadSiloAsset(BEANSTALK, UNRIPE_BEAN);
      urbeanSiloAsset.depositedBDV = BigInt.fromString("19556945000000");
      urbeanSiloAsset.save();

      let urlpSiloAsset = loadSiloAsset(BEANSTALK, UNRIPE_BEAN_3CRV);
      urlpSiloAsset.depositedBDV = BigInt.fromString("24417908000000");
      urlpSiloAsset.save();

      /// Set EMA, whitelisted tokens
      // bean3crv intentionally not whitelisted. It should still be included in non-gauge deposited bdv
      let siloYield = loadSiloYield(20000, 720);
      siloYield.beansPerSeasonEMA = BigDecimal.fromString("100");
      siloYield.whitelistedTokens = [
        BEAN_ERC20.toHexString(),
        BEAN_WETH_CP2_WELL.toHexString(),
        UNRIPE_BEAN.toHexString(),
        UNRIPE_BEAN_3CRV.toHexString()
      ];
      siloYield.save();

      /// Actual entity-based calculation here
      YieldHandler.updateSiloVAPYs(20000, ZERO_BI, 720);

      const beanResult = loadTokenYield(BEAN_ERC20, 20000, 720);
      log.info("bean apy {}", [beanResult.beanAPY.toString()]);
      log.info("stalk apy {}", [beanResult.stalkAPY.toString()]);
      assert.assertTrue(beanResult.beanAPY.equals(BigDecimal.fromString("1.54644190080929820744293897629")));
      assert.assertTrue(beanResult.stalkAPY.equals(BigDecimal.fromString("431.437897488823610478263760573224")));

      const wethResult = loadTokenYield(BEAN_WETH_CP2_WELL, 20000, 720);
      log.info("bean apy {}", [wethResult.beanAPY.toString()]);
      log.info("stalk apy {}", [wethResult.stalkAPY.toString()]);
      assert.assertTrue(wethResult.beanAPY.equals(BigDecimal.fromString("2.5780234580234848544328050648487")));
      assert.assertTrue(wethResult.stalkAPY.equals(BigDecimal.fromString("860.7918339311777507447195117507077")));

      const zeroGsResult = loadTokenYield(UNRIPE_BEAN, 20000, 720);
      log.info("bean apy {}", [zeroGsResult.beanAPY.toString()]);
      log.info("stalk apy {}", [zeroGsResult.stalkAPY.toString()]);
      assert.assertTrue(zeroGsResult.beanAPY.equals(BigDecimal.fromString("0.5127416037336945664701332044003")));
      assert.assertTrue(zeroGsResult.stalkAPY.equals(BigDecimal.fromString("1.6633821505548202866916203490403")));
    });
  });
});
