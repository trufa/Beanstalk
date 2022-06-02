/*
 SPDX-License-Identifier: MIT
*/

pragma solidity =0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../farm/facets/SiloFacet/SiloFacet.sol";
import "../../libraries/Silo/LibWhitelist.sol";

/**
 * @author Publius
 * @title Mock Silo Facet
**/

contract MockSiloFacet is SiloFacet {

    using SafeMath for uint256;

    function mockWhitelistToken(address token, bytes4 selector, uint32 stalk, uint32 seeds) external {
       LibWhitelist.whitelistToken(token, selector, stalk, seeds);
    }

    function mockBDV(uint256 amount) external pure returns (uint256) {
        return amount;
    }

    function mockUnripeLPDeposit(uint256 t, uint32 _s, uint256 amount, uint256 bdv) external {
        _update(msg.sender);
        if (t == 0) {
            s.a[msg.sender].lp.deposits[_s] += amount;
            s.a[msg.sender].lp.depositSeeds[_s] += bdv.mul(4);
        }
        else if (t == 1) LibTokenSilo.addDeposit(msg.sender, C.unripeLPPool1(), _s, amount, bdv);
        else if (t == 2) LibTokenSilo.addDeposit(msg.sender, C.unripeLPPool2(), _s, amount, bdv);
        LibTokenSilo.incrementDepositedToken(C.unripeLPAddress(), bdv);
        bdv = bdv.mul(C.initialRecap()).div(1e18);
        uint256 seeds = bdv.mul(s.ss[C.unripeLPAddress()].seeds);
        uint256 stalk = bdv.mul(s.ss[C.unripeLPAddress()].stalk).add(LibSilo.stalkReward(seeds, season() - _s));
        LibSilo.depositSiloAssets(msg.sender, seeds, stalk);
    }

    function mockUnripeBeanDeposit(uint32 _s, uint256 amount) external {
        _update(msg.sender);
        s.a[msg.sender].bean.deposits[_s] += amount;
        LibTokenSilo.incrementDepositedToken(C.unripeBeanAddress(), amount);
        amount = amount.mul(C.initialRecap()).div(1e18);
        uint256 seeds = amount.mul(s.ss[C.unripeBeanAddress()].seeds);
        uint256 stalk = amount.mul(s.ss[C.unripeBeanAddress()].stalk).add(LibSilo.stalkReward(seeds, season() - _s));
        LibSilo.depositSiloAssets(msg.sender, seeds, stalk);
    }
}