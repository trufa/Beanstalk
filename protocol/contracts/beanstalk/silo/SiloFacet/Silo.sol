/**
 * SPDX-License-Identifier: MIT
 **/

pragma solidity =0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./SiloExit.sol";
import "~/libraries/Silo/LibSilo.sol";
import "~/libraries/Silo/LibTokenSilo.sol";

/**
 * @title Silo
 * @author Publius
 * @notice Provides utility functions for claiming Silo rewards, including:
 *
 * - Grown Stalk (see "Mow")
 * - Earned Beans, Earned Stalk (see "Plant")
 * - 3CRV earned during a Flood (see "Flood")
 *
 * For backwards compatibility, a Flood is sometimes referred to by its old name
 * "Season of Plenty".
 */
 
contract Silo is SiloExit {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using LibSafeMath128 for uint128;


    struct MigrateData {
        uint128 totalBdv;
        uint128 totalGrownStalkForToken;
    }

    //////////////////////// EVENTS ////////////////////////    

    /**
     * @notice Emitted when the deposit associated with the Earned Beans of
     * `account` are Planted.
     * @param account Owns the Earned Beans
     * @param beans The amount of Earned Beans claimed by `account`.
     */
    event Plant(
        address indexed account,
        uint256 beans
    );

    /**
     * @notice Emitted when 3CRV paid to `account` during a Flood is Claimed.
     * @param account Owns and receives the assets paid during a Flood.
     * @param plenty The amount of 3CRV claimed by `account`. This is the amount
     * that `account` has been paid since their last {ClaimPlenty}.
     * 
     * @dev Flood was previously called a "Season of Plenty". For backwards
     * compatibility, the event has not been changed. For more information on 
     * Flood, see: {FIXME(doc)}.
     */
    event ClaimPlenty(
        address indexed account,
        uint256 plenty
    );


    /**
     * @notice Emitted when `account` gains or loses Stalk.
     * @param account The account that gained or lost Stalk.
     * @param delta The change in Stalk.
     * @param deltaRoots The change in Roots. For more info on Roots, see: 
     * FIXME(doc)
     *   
     * @dev {StalkBalanceChanged} should be emitted anytime a Deposit is added, removed or transferred AND
     * anytime an account Mows Grown Stalk.
     * @dev BIP-24 included a one-time re-emission of {SeedsBalanceChanged} for accounts that had
     * executed a Deposit transfer between the Replant and BIP-24 execution. For more, see:
     * [BIP-24](https://github.com/BeanstalkFarms/Beanstalk-Governance-Proposals/blob/master/bip/bip-24-fungible-bdv-support.md)
     * [Event-24-Event-Emission](https://github.com/BeanstalkFarms/Event-24-Event-Emission)
     */
    event StalkBalanceChanged(
        address indexed account,
        int256 delta,
        int256 deltaRoots
    );

    //////////////////////// INTERNAL: MOW ////////////////////////

    /**
     * @dev Claims the Grown Stalk for `msg.sender`.
     */
    modifier mowSender(address token) {
        _mow(msg.sender, token);
        _;
    }

    //TODO: make function that can mow multiple tokens

    /**
     * @dev Claims the Grown Stalk for `account` and applies it to their Stalk
     * balance.
     *
     * 
     *
     * This is why `_mow()` must be called before any actions that change Seeds,
     * including:
     *  - {SiloFacet-deposit}
     *  - {SiloFacet-withdrawDeposit}
     *  - {SiloFacet-withdrawDeposits}
     *  - {_plant}
     *  - {SiloFacet-transferDeposit(s)}
     */
   function _mow(address account, address token) internal {
        uint32 _lastUpdate = lastUpdate(account);

        //if last update > 0 and < stemStartSeason
        //require that user account seeds be zero
        // require(_lastUpdate > 0 && _lastUpdate >= s.season.stemStartSeason, 'silo migration needed'); //will require storage cold read... is there a better way?

        if((_lastUpdate != 0) && (_lastUpdate < s.season.stemStartSeason)) revert('silo migration needed');


        //sop stuff only needs to be updated once per season
        //if it started raininga nd it's still raining, or there was a sop
        if (s.season.rainStart > s.season.stemStartSeason) {
            if (_lastUpdate <= s.season.rainStart && _lastUpdate <= _season()) {
                // Increments `plenty` for `account` if a Flood has occured.
                // Saves Rain Roots for `account` if it is Raining.
                handleRainAndSops(account, _lastUpdate);

                // Reset timer so that Grown Stalk for a particular Season can only be 
                // claimed one time. 
                s.a[account].lastUpdate = _season();
            }
        }
        
        // Calculate the amount of Grown Stalk claimable by `account`.
        // Increase the account's balance of Stalk and Roots.
        __mow(account, token);
    }

    function __mow(address account, address token) private {

        int128 _stemTip = LibTokenSilo.stemTipForToken(IERC20(token));
        int128 _lastStem =  s.a[account].mowStatuses[token].lastStem;
        uint128 _bdv = s.a[account].mowStatuses[token].bdv;
        
        if (_bdv > 0) {
             // if account mowed the same token in the same season, skip
            if (_lastStem == _stemTip) {
                return;
            }

            //TODOSEEDS handle case where mow status hasn't been init'd, if last upadte season > 0 and older than update season


            // per the zero withdraw update, if a user plants within the morning, 
            // addtional roots will need to be issued, to properly calculate the earned beans. 
            // thus, a different mint stalk function is used to differ between deposits.
            LibSilo.mintGrownStalkAndGrownRoots(
                account,
                _balanceOfGrownStalk(
                    _lastStem,
                    _stemTip,
                    _bdv
                )
            );
        }

        // If this `account` has no BDV, skip to save gas. Still need to update lastStem 
        // (happen on initial deposit, since mow is called before any deposit)
        s.a[account].mowStatuses[token].lastStem = _stemTip;
        return;
    }
     
     
   function _migrateNoDeposits(address account) internal {
        require(s.a[account].s.seeds == 0, "only for zero seeds");
        uint32 _lastUpdate = lastUpdate(account);
        require(_lastUpdate > 0 && _lastUpdate < s.season.stemStartSeason, "no migration needed");

        s.a[account].lastUpdate = s.season.stemStartSeason;
    }

    //make some kind of init function for when silov3 is deployed
    //should take all their deposits, add them up and setup MowStatuses
    //will need every season
    //if the user has seeds, they havne't migrated
    //array of deposit seasons
    //array of tokens with deposit seasons
    //make sure bdv of everything lines up with the number of seeds they should have

    //add amounts as an input here? so we don't have to call tokenDeposit()
    function _mowAndMigrate(address account, address[] calldata tokens, uint32[][] calldata seasons) internal {
        require(tokens.length == seasons.length, "inputs not same length");

        //see if msg.sender has already migrated or not by checking seed balance
        require(s.a[account].s.seeds > 0, "no migration needed");

        //TODOSEEDS: require that a season of plenty is not currently happening?
        //do a legacy mow using the old silo seasons deposits
        s.a[account].lastUpdate = _season();
        LibSilo.mintStalk(account, LibLegacyTokenSilo.balanceOfGrownStalk(account));
        //at this point we've completed the guts of the old mow function, now we need to do the migration

        uint256 seedsTotalBasedOnInputDeposits = 0;

        // NOTE: this was used previously in lines 240, but since then is has been replaced with the function below:
        // uint32 stemStartSeason = uint32(s.season.stemStartSeason);

        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            //get how many seeds there should be per bdv
            // uint256 seedPerBdv = LibLegacyTokenSilo.getSeedsPerToken(address(token));
            MigrateData memory migrateData;

            for (uint256 j = 0; j < seasons[i].length; j++) {
                uint32 season = seasons[i][j];

                Account.Deposit memory d;
                (d.amount, d.bdv) = LibLegacyTokenSilo.tokenDeposit(account, token, season);

                migrateData.totalGrownStalkForToken += _calcGrownStalkForDeposit(
                    d.bdv * LibLegacyTokenSilo.getSeedsPerToken(address(token)),
                    season
                );

                //withdraw this deposit
                LibLegacyTokenSilo.removeDepositFromAccount(
                                    account,
                                    token,
                                    season,
                                    d.amount
                                );

                //add to running total of seeds
                seedsTotalBasedOnInputDeposits += uint256(d.bdv) * LibLegacyTokenSilo.getSeedsPerToken(address(token));

                //add to running total of bdv
                migrateData.totalBdv += d.bdv;
            }


            //init mow status for this token
            s.a[account].mowStatuses[token].lastStem = LibTokenSilo.stemTipForToken(IERC20(token));
            s.a[account].mowStatuses[token].bdv = uint128(migrateData.totalBdv);

            int128 grownStalkIndexToDepositAt = LibTokenSilo.grownStalkAndBdvToCumulativeGrownStalk(
                IERC20(token), 
                migrateData.totalGrownStalkForToken, 
                migrateData.totalBdv
            );
            //now we need to deposit totalBdv and totalGrownStalkForToken into the new silo
            LibTokenSilo.deposit(account, token, grownStalkIndexToDepositAt, migrateData.totalBdv);
        }

        //verify user account seeds total equals seedsTotalBasedOnInputDeposits
        if((s.a[account].s.seeds + 4 - seedsTotalBasedOnInputDeposits) > 100) {
            require(msg.sender == account, "deSynced seeds, only account can migrate");
        }

        //and wipe out old seed balances (all your seeds are belong to stem)
        s.a[account].s.seeds = 0;
    }

    function _calcGrownStalkForDeposit(
        uint256 seedsForDeposit,
        uint32 season
    ) internal view returns (uint128 grownStalk) {
        uint32 stemStartSeason = uint32(s.season.stemStartSeason);
        return uint128(seedsForDeposit * LibLegacyTokenSilo.stalkReward(seedsForDeposit, stemStartSeason - season));
    }


    //////////////////////// INTERNAL: PLANT ////////////////////////

    /**
     * @dev Plants the Plantable BDV of `account` associated with its Earned
     * Beans.
     * 
     * For more info on Planting, see: {SiloFacet-plant}
     */
     
    function _plant(address account, address token) internal returns (uint256 beans) {
        // Need to Mow for `account` before we calculate the balance of 
        // Earned Beans. //TODOSEEDS do we need to mow all tokens?
        
        // per the zero withdraw update, planting is handled differently 
        // depending whether or not the user plants during the vesting period of beanstalk. 
        // during the vesting period, the earned beans are not issued to the user.
        // thus, the roots calculated for a given user is different. 
        // This is handled by the super mow function, which stores the difference in roots.
        _mow(account, token);
        uint256 accountStalk = s.a[account].s.stalk;

        // Calculate balance of Earned Beans.
        beans = _balanceOfEarnedBeans(account, accountStalk);
        s.a[account].deltaRoots = 0;
        if (beans == 0) return 0;
        
        // Reduce the Silo's supply of Earned Beans.
        s.earnedBeans = s.earnedBeans.sub(uint128(beans));

        // Deposit Earned Beans if there are any. Note that 1 Bean = 1 BDV.
        LibTokenSilo.addDepositToAccount(
            account,
            C.beanAddress(),
            LibTokenSilo.stemTipForToken(IERC20(token)),
            beans, // amount
            beans // bdv
        );
        s.a[account].deltaRoots = 0; // must be 0'd, as calling balanceOfEarnedBeans would give a invalid amount of beans. 

        // Calculate the Plantable Seeds associated with the Earned Beans that were Deposited.
        //TODOSEEDS figure out what to do here

        // Plantable Seeds don't generate Grown Stalk until they are Planted (i.e., not auto-compounding). 
        // Plantable Seeds are not included in the Seed supply, so new Seeds must be minted during `plant()`.
        // (Notice that {Sun.sol:rewardToSilo} does not mint any Seeds, even though it updates Earned Beans.)
        // LibSilo.mintSeeds(account, seeds); // mints to `account` and updates totals

        // Earned Stalk associated with Earned Beans generate more Earned Beans automatically (i.e., auto compounding).
        // Earned Stalk are minted when Earned Beans are minted during Sunrise. See {Sun.sol:rewardToSilo} for details.
        // Similarly, `account` does not receive additional Roots from Earned Stalk during a Plant.
        // The following lines allocate Earned Stalk that has already been minted to `account`.
        uint256 stalk = beans.mul(C.getStalkPerBean());
        s.a[account].s.stalk = accountStalk.add(stalk);

        emit StalkBalanceChanged(account, int256(stalk), 0);
        emit Plant(account, beans);
    }

    //////////////////////// INTERNAL: SEASON OF PLENTY ////////////////////////

    /**
     * @dev Gas optimization: An account can call `{SiloFacet:claimPlenty}` even
     * if `s.a[account].sop.plenty == 0`. This would emit a ClaimPlenty event
     * with an amount of 0.
     */
    function _claimPlenty(address account) internal {
        // Plenty is earned in the form of 3Crv.
        uint256 plenty = s.a[account].sop.plenty;
        C.threeCrv().safeTransfer(account, plenty);
        delete s.a[account].sop.plenty;

        emit ClaimPlenty(account, plenty);
    }

    /**
     * FIXME(refactor): replace `lastUpdate()` -> `_lastUpdate()` and rename this param?
     */
    function handleRainAndSops(address account, uint32 _lastUpdate) private {
        // If no roots, reset Sop counters variables
        if (s.a[account].roots == 0) {
            s.a[account].lastSop = s.season.rainStart;
            s.a[account].lastRain = 0;
            return;
        }
        // If a Sop has occured since last update, calculate rewards and set last Sop.
        if (s.season.lastSopSeason > _lastUpdate) {
            s.a[account].sop.plenty = balanceOfPlenty(account);
            s.a[account].lastSop = s.season.lastSop;
        }
        if (s.season.raining) {
            // If rain started after update, set account variables to track rain.
            if (s.season.rainStart > _lastUpdate) {
                s.a[account].lastRain = s.season.rainStart;
                s.a[account].sop.roots = s.a[account].roots;
            }
            // If there has been a Sop since rain started,
            // save plentyPerRoot in case another SOP happens during rain.
            if (s.season.lastSop == s.season.rainStart) {
                s.a[account].sop.plentyPerRoot = s.sops[s.season.lastSop];
            }
        } else if (s.a[account].lastRain > 0) {
            // Reset Last Rain if not raining.
            s.a[account].lastRain = 0;
        }
    }

}
