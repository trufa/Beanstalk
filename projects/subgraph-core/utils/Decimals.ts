import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";

export const DEFAULT_DECIMALS = 6;

export const ZERO_BI = BigInt.fromI32(0);
export const ONE_BI = BigInt.fromI32(1);
export const BI_6 = BigInt.fromI32(6);
export const BI_10 = BigInt.fromI32(10);
export const BI_18 = BigInt.fromI32(18);
export const ZERO_BD = BigDecimal.fromString("0");
export const ONE_BD = BigDecimal.fromString("1");
export const BD_18 = BigDecimal.fromString("18");

export function pow(base: BigDecimal, exponent: number): BigDecimal {
  let result = base;

  if (exponent == 0) {
    return BigDecimal.fromString("1");
  }

  for (let i = 2; i <= exponent; i++) {
    result = result.times(base);
  }

  return result;
}

export function toDecimal(value: BigInt, decimals: number = DEFAULT_DECIMALS): BigDecimal {
  let precision = BigInt.fromI32(10)
    .pow(<u8>decimals)
    .toBigDecimal();

  return value.divDecimal(precision);
}

export function toBigInt(value: BigDecimal, decimals: number = DEFAULT_DECIMALS): BigInt {
  let precision = 10 * decimals;
  return BigInt.fromString(value.times(BigDecimal.fromString(precision.toString())).truncate(0).toString());
}

export function emptyBigIntArray(length: i32): BigInt[] {
  let array = [ZERO_BI, ZERO_BI];
  for (let i = 2; i < length; i++) array.push(ZERO_BI);
  return array;
}

export function emptyBigDecimalArray(length: i32): BigDecimal[] {
  let array = [ZERO_BD, ZERO_BD];
  for (let i = 2; i < length; i++) array.push(ZERO_BD);
  return array;
}

export function deltaBigIntArray(current: BigInt[], prior: BigInt[]): BigInt[] {
  let finalArray = emptyBigIntArray(current.length);
  for (let i = 0; i < current.length; i++) {
    finalArray[i] = current[i].minus(prior[i]);
  }
  return finalArray;
}

export function deltaBigDecimalArray(current: BigDecimal[], prior: BigDecimal[]): BigDecimal[] {
  let finalArray = emptyBigDecimalArray(current.length);
  for (let i = 0; i < current.length; i++) {
    finalArray[i] = current[i].minus(prior[i]);
  }
  return finalArray;
}

export function getBigDecimalArrayTotal(detail: BigDecimal[]): BigDecimal {
  let total = ZERO_BD;
  for (let i = 0; i < detail.length; i++) total = total.plus(detail[i]);
  return total;
}
