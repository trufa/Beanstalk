import { Address, BigInt } from "@graphprotocol/graph-ts";
import { Sunrise } from "../generated/Beanstalk/Beanstalk";
import { getBeanTokenAddress, loadBean, updateBeanSeason, updateBeanValues } from "./utils/Bean";
import { loadOrCreatePool, updatePoolPrice, updatePoolSeason, updatePoolValues } from "./utils/Pool";
import { BeanstalkPrice } from "../generated/Beanstalk/BeanstalkPrice";
import {
  BEANSTALK_PRICE,
  BEAN_3CRV,
  BEAN_ERC20,
  BEAN_ERC20_V1,
  BEAN_WETH_CP2_WELL,
  BEAN_WETH_V1,
  CURVE_PRICE
} from "../../subgraph-core/utils/Constants";
import { ZERO_BD, ZERO_BI, toDecimal } from "../../subgraph-core/utils/Decimals";
import { CurvePrice } from "../generated/Beanstalk/CurvePrice";
import { checkBeanCross } from "./utils/Cross";
import { curveDeltaB, curvePriceAndLp, uniswapV2DeltaB, uniswapV2Price, updatePreReplantPriceETH } from "./utils/Price";

export function handleSunrise(event: Sunrise): void {
  // Update the season for hourly and daily liquidity metrics

  let beanToken = getBeanTokenAddress(event.block.number);

  updateBeanSeason(beanToken, event.block.timestamp, event.params.season.toI32());

  let bean = loadBean(beanToken);
  let oldBeanPrice = bean.price;
  let oldBeanLiquidity = bean.liquidityUSD;
  for (let i = 0; i < bean.pools.length; i++) {
    updatePoolSeason(bean.pools[i], event.block.timestamp, event.block.number, event.params.season.toI32());
  }

  // Fetch price from price contract to capture any 3CRV movements against peg.
  if (event.params.season > BigInt.fromI32(6074)) {
    // Attempt to pull from Beanstalk Price contract first for the overall Bean price update
    let beanstalkPrice = BeanstalkPrice.bind(BEANSTALK_PRICE);
    let beanstalkQuery = beanstalkPrice.try_price();

    if (!beanstalkQuery.reverted) {
      // We can use the Beanstalk Price contract to update overall price, and call the updates for Curve and Well price updates
      // We also know that the additional calls should not revert at this point
      let beanCurve = loadOrCreatePool(BEAN_3CRV.toHexString(), event.block.number);
      let beanWell = loadOrCreatePool(BEAN_WETH_CP2_WELL.toHexString(), event.block.number);

      let deltaBeanLiquidity = toDecimal(beanstalkQuery.value.liquidity).minus(oldBeanLiquidity);

      let beanPrice = toDecimal(beanstalkQuery.value.price);
      // Overall Bean update
      updateBeanValues(BEAN_ERC20.toHexString(), event.block.timestamp, beanPrice, ZERO_BI, ZERO_BI, ZERO_BD, deltaBeanLiquidity);

      // Curve pool update
      let curvePrice = beanstalkPrice.getCurve();
      updatePoolValues(
        BEAN_3CRV.toHexString(),
        event.block.timestamp,
        event.block.number,
        ZERO_BI,
        ZERO_BD,
        toDecimal(curvePrice.liquidity).minus(beanCurve.liquidityUSD),
        curvePrice.deltaB
      );
      updatePoolPrice(BEAN_3CRV.toHexString(), event.block.timestamp, event.block.number, toDecimal(curvePrice.price));

      // Well pool update
      let wellPrice = beanstalkPrice.getConstantProductWell(BEAN_WETH_CP2_WELL);
      updatePoolValues(
        BEAN_WETH_CP2_WELL.toHexString(),
        event.block.timestamp,
        event.block.number,
        ZERO_BI,
        ZERO_BD,
        toDecimal(wellPrice.liquidity).minus(beanWell.liquidityUSD),
        wellPrice.deltaB
      );
      updatePoolPrice(BEAN_WETH_CP2_WELL.toHexString(), event.block.timestamp, event.block.number, toDecimal(wellPrice.price));

      checkBeanCross(BEAN_ERC20.toHexString(), event.block.timestamp, event.block.number, oldBeanPrice, beanPrice);
    } else {
      // Pre Basin deployment - Use original Curve price contract to update on each season.
      let curvePrice = CurvePrice.bind(CURVE_PRICE);
      let curve = curvePrice.try_getCurve();
      let beanCurve = loadOrCreatePool(BEAN_3CRV.toHexString(), event.block.number);

      if (!curve.reverted) {
        updateBeanValues(BEAN_ERC20.toHexString(), event.block.timestamp, toDecimal(curve.value.price), ZERO_BI, ZERO_BI, ZERO_BD, ZERO_BD);
        updatePoolValues(
          BEAN_3CRV.toHexString(),
          event.block.timestamp,
          event.block.number,
          ZERO_BI,
          ZERO_BD,
          toDecimal(curve.value.liquidity).minus(beanCurve.liquidityUSD),
          curve.value.deltaB
        );
        updatePoolPrice(BEAN_3CRV.toHexString(), event.block.timestamp, event.block.number, toDecimal(curve.value.price));
        checkBeanCross(BEAN_ERC20.toHexString(), event.block.timestamp, event.block.number, oldBeanPrice, toDecimal(curve.value.price));
      }
    }
  } else {
    // Pre-Replant
    let bean = loadBean(BEAN_ERC20_V1.toHexString());
    let weightedPrice = ZERO_BD;
    let totalLiquidity = ZERO_BD;
    for (let i = 0; i < bean.pools.length; i++) {
      const pool = loadOrCreatePool(bean.pools[i], event.block.number);
      let price = ZERO_BD;
      let liquidity = ZERO_BD;
      let deltaB = ZERO_BI;
      if (bean.pools[i] == BEAN_WETH_V1.toHexString()) {
        const wethToken = updatePreReplantPriceETH();
        const reserves = [toDecimal(pool.reserves[0], 18), toDecimal(pool.reserves[1])];
        price = uniswapV2Price(reserves[1], reserves[0], wethToken.lastPriceUSD);
        liquidity = reserves[0].times(wethToken.lastPriceUSD);
        deltaB = uniswapV2DeltaB(reserves[1], reserves[0], wethToken.lastPriceUSD);
      } else {
        const priceAndLp = curvePriceAndLp(Address.fromString(bean.pools[i]));
        price = priceAndLp[0];
        liquidity = priceAndLp[1];
        deltaB = curveDeltaB(Address.fromString(bean.pools[i]), pool.reserves[0]);
      }

      // Update price, liquidity, and deltaB in the pool
      updatePoolValues(
        bean.pools[i],
        event.block.timestamp,
        event.block.number,
        ZERO_BI,
        ZERO_BD,
        liquidity.minus(pool.liquidityUSD),
        deltaB
      );
      updatePoolPrice(bean.pools[i], event.block.timestamp, event.block.number, price);

      weightedPrice = weightedPrice.plus(price.times(liquidity));
      totalLiquidity = totalLiquidity.plus(liquidity);
    }

    const totalPrice = weightedPrice.div(totalLiquidity);
    updateBeanValues(
      BEAN_ERC20_V1.toHexString(),
      event.block.timestamp,
      totalPrice,
      ZERO_BI,
      ZERO_BI,
      ZERO_BD,
      totalLiquidity.minus(bean.liquidityUSD)
    );
    checkBeanCross(BEAN_ERC20_V1.toHexString(), event.block.timestamp, event.block.number, bean.price, totalPrice);
  }
}
