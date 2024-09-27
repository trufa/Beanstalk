import { BeanstalkSDK } from "@beanstalk/sdk";
import chalk from "chalk";

export const getPrice = async (sdk: BeanstalkSDK) => {
  const season = await sdk.sun.getSeason();
  const price = await sdk.bean.getPrice();
  console.log(`${chalk.bold.whiteBright("Season: ")}${chalk.greenBright(season.toString())}`);
  console.log(`${chalk.bold.whiteBright("Price: ")}${chalk.greenBright(price.toHuman())}`);
};
