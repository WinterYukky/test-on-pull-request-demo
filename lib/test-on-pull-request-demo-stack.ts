import * as cdk from "aws-cdk-lib";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as events from "aws-cdk-lib/aws-events";
import * as eventTargets from "aws-cdk-lib/aws-events-targets";
import { Asset } from "aws-cdk-lib/aws-s3-assets";
import { Construct } from "constructs";
import * as codecommit from "./codecommit";

export class TestOnPullRequestDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const gitRepository = new codecommit.Repository(this, "Repository", {
      repositoryName: "PullReqeustApproveDemo",
      code: codecommit.Code.fromAsset(
        new Asset(this, "CodeAsset", {
          path: ".",
          exclude: ["cdk.out", "node_modules"],
        })
      ),
    });
    const buildProject = new codebuild.Project(this, "Projct", {
      source: codebuild.Source.codeCommit({ repository: gitRepository }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
      },
      buildSpec: codebuild.BuildSpec.fromObjectToYaml({
        version: 0.2,
        phases: {
          install: {
            "runtime-versions": {
              nodejs: "20.x",
            },
          },
          pre_build: {
            commands: ["node --version", "npm ci"],
          },
          build: {
            commands: [
              "npm run test",
              "REVISION_ID=$(aws codecommit get-pull-request --pull-request-id $PULL_REQUEST_ID | jq -r '.pullRequest.revisionId')",
              "aws codecommit update-pull-request-approval-state --pull-request-id $PULL_REQUEST_ID --revision-id $REVISION_ID --approval-state APPROVE --region $AWS_REGION",
            ],
          },
        },
      }),
    });
    gitRepository.grant(
      buildProject,
      "codecommit:CreatePullRequestApprovalRule",
      "codecommit:GetPullRequest",
      "codecommit:PostCommentForPullRequest",
      "codecommit:UpdatePullRequestApprovalState"
    );

    new events.Rule(this, "PullRequestTriggerRule", {
      eventPattern: {
        detail: {
          destinationReference: ["refs/heads/main"],
          isMerged: ["False"],
          repositoryNames: [gitRepository.repositoryName],
          event: ["pullRequestCreated", "pullRequestSourceBranchUpdated"],
        },
        source: ["aws.codecommit"],
      },
      targets: [
        new eventTargets.CodeBuildProject(buildProject, {
          event: {
            bind(_rule) {
              return {
                inputPathsMap: {
                  "detail-destinationCommit": "$.detail.destinationCommit",
                  "detail-pullRequestId": "$.detail.pullRequestId",
                  "detail-sourceCommit": "$.detail.sourceCommit",
                },
                inputTemplate: JSON.stringify(
                  {
                    sourceVersion: "<detail-sourceCommit>",
                    environmentVariablesOverride: [
                      {
                        name: "DESTINATION_COMMIT_ID",
                        type: "PLAINTEXT",
                        value: "<detail-destinationCommit>",
                      },
                      {
                        name: "SOURCE_COMMIT_ID",
                        type: "PLAINTEXT",
                        value: "<detail-sourceCommit>",
                      },
                      {
                        name: "PULL_REQUEST_ID",
                        type: "PLAINTEXT",
                        value: "<detail-pullRequestId>",
                      },
                    ],
                  },
                  null,
                  "\t"
                ),
              };
            },
          },
        }),
      ],
    });

    new codecommit.ApprovalRuleTemplate(this, "ApprovalRuleTemplate", {
      numberOfApprovalsNeeded: 1,
      destinationReferences: ["refs/heads/main"],
      approvalPoolMembers: [
        codecommit.ApprovalMember.fromRole(buildProject.role!),
      ],
      repositories: [gitRepository],
    });
  }
}
