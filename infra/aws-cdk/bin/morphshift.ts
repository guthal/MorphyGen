#!/usr/bin/env node
import "dotenv/config"
import * as cdk from "aws-cdk-lib"
import { MorphShiftStack } from "../lib/morphshift-stack.js"

const app = new cdk.App()

new MorphShiftStack(app, "MorphShiftStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
})
