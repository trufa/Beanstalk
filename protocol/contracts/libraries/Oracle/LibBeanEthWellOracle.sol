/*
 SPDX-License-Identifier: MIT
*/

pragma solidity =0.7.6;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import "contracts/libraries/LibAppStorage.sol";

/**
 * @title Bean Eth Well Oracle Library
 * @notice Contains a function to store and read the BEAN/ETH price in storage.
 * @dev
 * In each `sunrise`/`gm` call, {LibWellMinting} sets the BEAN/ETH price when
 * evalulating the Bean Eth Well during minting and {LibIncentive} reads the
 * BEAN/ETH price when calculating the Sunrise incentive.
 **/
library LibBeanEthWellOracle {
    using SafeMath for uint256;

    // The index of the Bean and Weth token addresses in all BEAN/ETH Wells.
    uint256 constant BEAN_INDEX = 0;
    uint256 constant ETH_INDEX = 1;

    /**
     * @dev Sets the BEAN/ETH price in {AppStorage} given a set of reserves.
     * It assumes that the reserves correspond to a BEAN/ETH Constant Product Well
     * given that it computes the price as beanReserve / ethReserve.
     */
    function setBeanEthWellPrice(uint256[] memory reserves) internal {
        AppStorage storage s = LibAppStorage.diamondStorage();

        // If the reserves length is 0, then {LibWellMinting} failed to compute
        // valid manipulation resistant reserves and thus the price is set to 0
        // indicating that the oracle failed to compute a valid price this Season.
        if (reserves.length == 0) {
            s.beanEthPrice = 0;
        } else {
            s.beanEthPrice = reserves[BEAN_INDEX].mul(1e18).div(reserves[ETH_INDEX]);
        }
    }

    /**
     * @dev Returns the BEAN / ETH price stored in {AppStorage}.
     * The BEAN / ETH price is used twice in sunrise(): Once during {LibEvaluate}
     * and another at {LibIncentive}. a boolean is used to indicate whether the
     * storage vairable should be reset to 1 for gas savings. This should be enabled
     * when this function is called last within the sunrise function.
     */
    function getBeanEthWellPrice(bool isLast) internal returns (uint price) {
        AppStorage storage s = LibAppStorage.diamondStorage();
        price = s.beanEthPrice;
        if(isLast){
            s.beanEthPrice = 1;
        }
    }
}
