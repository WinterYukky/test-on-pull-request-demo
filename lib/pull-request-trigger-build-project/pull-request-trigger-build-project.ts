import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as events from "aws-cdk-lib/aws-events";
import * as eventTargets from "aws-cdk-lib/aws-events-targets";
import { Construct } from "constructs";
import * as codecommit from "../codecommit";

/**
 * The props of PullRequestTriggerBuildProject.
 */
export interface PullRequestTriggerBuildProjectProps {
  /**
   * The CodeCommit repository.
   */
  readonly repository: codecommit.IRepository;
  /**
   * The prebuild commands.
   * @default - no execute commands on prebuld phase.
   */
  readonly prebuildCommands?: string[];
  /**
   * The build commands.
   */
  readonly commands: string[];
  /**
   * Use branch filters to only apply this template to a pull request if the destination branch name matches a name in the filter list.
   *
   * @default - no filter.
   */
  readonly branchFilters?: string[];
}

/**
 * Triggered by open pull request or update source branch of pull request.
 * This build project approve pull request after exec provided commands.
 *
 * This build project provide these environment variables.
 * - PULL_REQUEST_ID: The pull request ID
 * - DESTINATION_COMMIT_ID: The destination commit ID
 * - SOURCE_COMMIT_ID: The source commit ID
 */
export class PullRequestTriggerBuildProject extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: PullRequestTriggerBuildProjectProps
  ) {
    super(scope, id);

    const buildProject = new codebuild.Project(this, "Projct", {
      source: codebuild.Source.codeCommit({ repository: props.repository }),
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
            commands: props.prebuildCommands,
          },
          build: {
            commands: [
              ...props.commands,
              "REVISION_ID=$(aws codecommit get-pull-request --pull-request-id $PULL_REQUEST_ID | jq -r '.pullRequest.revisionId')",
              "aws codecommit update-pull-request-approval-state --pull-request-id $PULL_REQUEST_ID --revision-id $REVISION_ID --approval-state APPROVE --region $AWS_REGION",
            ],
          },
        },
      }),
    });
    props.repository.grant(
      buildProject,
      "codecommit:CreatePullRequestApprovalRule",
      "codecommit:GetPullRequest",
      "codecommit:PostCommentForPullRequest",
      "codecommit:UpdatePullRequestApprovalState"
    );

    new events.Rule(this, "PullRequestTriggerRule", {
      eventPattern: {
        detail: {
          destinationReference: props.branchFilters,
          isMerged: ["False"],
          repositoryNames: [props.repository.repositoryName],
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
      destinationReferences: props.branchFilters,
      approvalPoolMembers: [
        codecommit.ApprovalMember.fromRole(buildProject.role!),
      ],
      repositories: [props.repository],
    });
  }
}
