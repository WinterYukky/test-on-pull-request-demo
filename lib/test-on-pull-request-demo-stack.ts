import * as cdk from "aws-cdk-lib";
import { Asset } from "aws-cdk-lib/aws-s3-assets";
import { Construct } from "constructs";
import * as codecommit from "./codecommit";
import { PullRequestTriggerBuildProject } from "./pull-request-trigger-build-project";

export class TestOnPullRequestDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const gitRepository = new codecommit.Repository(this, "Repository", {
      repositoryName: "PullReqeustApproveDemo",
      // Initialize Git repository with this AWS CDK project code for testing.
      code: codecommit.Code.fromAsset(
        new Asset(this, "CodeAsset", {
          path: ".",
          exclude: [".git", "cdk.out", "node_modules"],
        })
      ),
    });
    new PullRequestTriggerBuildProject(this, "PullRequestTriggerBuildProject", {
      repository: gitRepository,
      branchFilters: ["refs/heads/main"],
      prebuildCommands: ["node --version", "npm ci"],
      commands: ["npm run test"],
    });
  }
}
