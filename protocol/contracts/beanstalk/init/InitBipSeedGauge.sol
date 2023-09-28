/*
 SPDX-License-Identifier: MIT
*/

pragma solidity =0.7.6;
pragma experimental ABIEncoderV2;
import "contracts/beanstalk/AppStorage.sol";
import "../../C.sol";
import "contracts/libraries/Silo/LibWhitelistedTokens.sol";
/**
 * @author Publius, Brean
 * @title InitBipSeedGauge initalizes the seed gauge, updates siloSetting Struct 
 **/

contract InitBipSeedGauge{    
    AppStorage internal s;

    uint256 private constant TARGET_SEASONS_TO_CATCHUP = 4380;    
    
    struct OldSiloSettings {
        bytes4 selector;
        uint32 stalkEarnedPerSeason; 
        uint32 stalkIssuedPerBdv;
		uint32 milestoneSeason;
		int96 milestoneStem;
        bytes1 encodeType; 
    }
    // reference
    struct NewSiloSettings {
        bytes4 selector; // ─────────────┐ 4
        uint32 stalkIssuedPerBdv; //     │ 4  (12)
		uint32 milestoneSeason; //       │ 4  (16)
		int96 milestoneStem; //          │ 12 (28)
        bytes1 encodeType; // ───────────┘ 1  (29)
        // 3 bytes are left here.
        uint32 stalkEarnedPerSeason; // ─┐ 4 
        uint32 lpGaugePoints; //         │ 4  (8)
        bytes4 GPSelector; //  ──────────┘ 4  (12)
        // 20 bytes are left here.
    }




    // assumption is that unripe assets has been migrated to the bean-eth Wells.
    function init() external {

        // update silo settings from old storage to new storage struct.
        OldSiloSettings storage oldSiloSettings;
        Storage.SiloSettings memory newSiloSettings;

        uint128 totalBdv;
        address[] memory siloTokens = LibWhitelistedTokens.getSiloTokensWithUnripe();

        uint24[5] memory lpGaugePoints = [uint24(0),0,0,0,0];
        bytes4[5] memory GPSelectors = [bytes4(0x00000000),0x00000000,0x00000000,0x00000000, 0x00000000];
        for(uint i = 0; i < siloTokens.length; i++) {
            Storage.SiloSettings storage ss = s.ss[siloTokens[i]];
            assembly {
                oldSiloSettings.slot := ss.slot
            }
            newSiloSettings.selector = oldSiloSettings.selector;
            newSiloSettings.stalkEarnedPerSeason = oldSiloSettings.stalkEarnedPerSeason;
            newSiloSettings.stalkIssuedPerBdv = oldSiloSettings.stalkIssuedPerBdv;
            newSiloSettings.milestoneSeason = oldSiloSettings.milestoneSeason;
            newSiloSettings.milestoneStem = oldSiloSettings.milestoneStem;
            newSiloSettings.encodeType = oldSiloSettings.encodeType;
            //TODO: add lpGaugePoints and GPSelector
            newSiloSettings.lpGaugePoints = lpGaugePoints[i];
            newSiloSettings.GPSelector = GPSelectors[i];

            s.ss[siloTokens[i]] = newSiloSettings;

            // get depositedBDV to use later:
            totalBdv += s.siloBalances[siloTokens[i]].depositedBdv;
        }
        // initalize seed gauge. 
        s.seedGauge.percentOfNewGrownStalkToLP = 0.5e6; // 50% // TODO: how to set this?
        s.seedGauge.averageGrownStalkPerBdvPerSeason =  initalizeAverageGrownStalkPerBdv(totalBdv);

        // initalize s.usdEthPrice 
        s.usdEthPrice = 1;

        // initalize V2 cases.
        s.casesV2 = [
        //////////////////////////////// Exremely Low L2SR ////////////////////////////////////////
        //          Dsc soil demand,    Steady soil demand, Inc soil demand,    null
            bytes8(0x0f4240030f424000), 0x0f4240010f424000, 0x0f4240000f424000, 0x0000000000000000, // Exs Low: P < 1
                    0x0f4240ff0f424000, 0x0f4240fd0f424000, 0x0f4240fd0f424000, 0x0000000000000000, //          P > 1
                    0x0f4240030f424000, 0x0f4240010f424000, 0x0f4240000f424000, 0x0000000000000000, // Rea Low: P < 1
                    0x0f4240ff0f424000, 0x0f4240fd0f424000, 0x0f4240fd0f424000, 0x0000000000000000, //          P > 1
                    0x0f4240030f424000, 0x0f4240030f424000, 0x0f4240010f424000, 0x0000000000000000, // Rea Hgh: P < 1
                    0x0f4240000f424000, 0x0f4240ff0f424000, 0x0f4240fd0f424000, 0x0000000000000000, //          P > 1
                    0x0f4240030f424000, 0x0f4240030f424000, 0x0f4240010f424000, 0x0000000000000000, // Exs Hgh: P < 1
                    0x0f4240000f424000, 0x0f4240ff0f424000, 0x0f4240fd0f424000, 0x0000000000000000, //          P > 1
        //////////////////////////////// Reasonably Low L2SR //////////////////////////////////////
                    0x0f4240030f424000, 0x0f4240010f424000, 0x0f4240000f424000, 0x0000000000000000, // Exs Low: P < 1
                    0x0f4240ff0f424000, 0x0f4240fd0f424000, 0x0f4240fd0f424000, 0x0000000000000000, //          P > 1
                    0x0f4240030f424000, 0x0f4240010f424000, 0x0f4240000f424000, 0x0000000000000000, // Rea Low: P < 1
                    0x0f4240ff0f424000, 0x0f4240fd0f424000, 0x0f4240fd0f424000, 0x0000000000000000, //          P > 1
                    0x0f4240030f424000, 0x0f4240030f424000, 0x0f4240010f424000, 0x0000000000000000, // Rea Hgh: P < 1
                    0x0f4240000f424000, 0x0f4240ff0f424000, 0x0f4240fd0f424000, 0x0000000000000000, //          P > 1
                    0x0f4240030f424000, 0x0f4240030f424000, 0x0f4240010f424000, 0x0000000000000000, // Exs Hgh: P < 1
                    0x0f4240000f424000, 0x0f4240ff0f424000, 0x0f4240fd0f424000, 0x0000000000000000, //          P > 1
        //////////////////////////////// Reasonably High L2SR //////////////////////////////////////
                    0x0f4240030f424000, 0x0f4240010f424000, 0x0f4240000f424000, 0x0000000000000000, // Exs Low: P < 1
                    0x0f4240ff0f424000, 0x0f4240fd0f424000, 0x0f4240fd0f424000, 0x0000000000000000, //          P > 1
                    0x0f4240030f424000, 0x0f4240010f424000, 0x0f4240000f424000, 0x0000000000000000, // Rea Low: P < 1
                    0x0f4240ff0f424000, 0x0f4240fd0f424000, 0x0f4240fd0f424000, 0x0000000000000000, //          P > 1
                    0x0f4240030f424000, 0x0f4240030f424000, 0x0f4240010f424000, 0x0000000000000000, // Rea Hgh: P < 1
                    0x0f4240000f424000, 0x0f4240ff0f424000, 0x0f4240fd0f424000, 0x0000000000000000, //          P > 1
                    0x0f4240030f424000, 0x0f4240030f424000, 0x0f4240010f424000, 0x0000000000000000, // Exs Hgh: P < 1
                    0x0f4240000f424000, 0x0f4240ff0f424000, 0x0f4240fd0f424000, 0x0000000000000000, //          P > 1
        //////////////////////////////// Extremely High L2SR //////////////////////////////////////
                    0x0f4240030f424000, 0x0f4240010f424000, 0x0f4240000f424000, 0x0000000000000000, // Exs Low: P < 1
                    0x0f4240ff0f424000, 0x0f4240fd0f424000, 0x0f4240fd0f424000, 0x0000000000000000, //          P > 1
                    0x0f4240030f424000, 0x0f4240010f424000, 0x0f4240000f424000, 0x0000000000000000, // Rea Low: P < 1
                    0x0f4240ff0f424000, 0x0f4240fd0f424000, 0x0f4240fd0f424000, 0x0000000000000000, //          P > 1
                    0x0f4240030f424000, 0x0f4240030f424000, 0x0f4240010f424000, 0x0000000000000000, // Rea Hgh: P < 1
                    0x0f4240000f424000, 0x0f4240ff0f424000, 0x0f4240fd0f424000, 0x0000000000000000, //          P > 1
                    0x0f4240030f424000, 0x0f4240030f424000, 0x0f4240010f424000, 0x0000000000000000, // Exs Hgh: P < 1
                    0x0f4240000f424000, 0x0f4240ff0f424000, 0x0f4240fd0f424000, 0x0000000000000000  //          P > 1
        ];
    }

    function initalizeAverageGrownStalkPerBdv(uint256 totalBdv) internal view returns (uint128) {
        uint256 averageGrownStalkPerBdv = s.s.stalk / totalBdv - 10000;
        return uint128(averageGrownStalkPerBdv / TARGET_SEASONS_TO_CATCHUP);
    }
}