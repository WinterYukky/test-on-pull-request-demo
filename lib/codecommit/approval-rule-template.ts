import { Names, Resource } from "aws-cdk-lib";
import { Repository } from "aws-cdk-lib/aws-codecommit";
import { IRole, IUser } from "aws-cdk-lib/aws-iam";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { AssociateApprovalRuleTemplate } from "./associate-approval-rule-template-with-repository";

interface ApprovalRuleTemplateContent {
  readonly Version: "2018-11-08";
  readonly DestinationReferences?: string[];
  readonly Statements: {
    readonly Type: "Approvers";
    readonly NumberOfApprovalsNeeded: number;
    readonly ApprovalPoolMembers?: string[];
  }[];
}

export class ApprovalMember {
  static fromRole(role: IRole) {
    return new ApprovalMember(role.roleName);
  }
  static fromUser(user: IUser) {
    return new ApprovalMember(user.userName);
  }
  private constructor(readonly name: string) {}
}

export interface IApprovalRuleTemplate {
  readonly approvalRuleTemplateName: string;
}

export interface ApprovalRuleTemplateProps {
  readonly approvalRuleTemplateName?: string;
  readonly destinationReferences?: string[];
  readonly numberOfApprovalsNeeded: number;
  readonly approvalPoolMembers?: ApprovalMember[];
  readonly description?: string;
  readonly repositories?: Repository[];
}

export class ApprovalRuleTemplate
  extends Resource
  implements IApprovalRuleTemplate
{
  readonly approvalRuleTemplateName: string;
  constructor(scope: Construct, id: string, props: ApprovalRuleTemplateProps) {
    super(scope, id);

    this.approvalRuleTemplateName =
      props.approvalRuleTemplateName ?? Names.uniqueResourceName(this, {});

    const resource = new AwsCustomResource(this, "Resource", {
      resourceType: "Custom::ApprovalRuleTemplate",
      onCreate: {
        service: "@aws-sdk/client-codecommit",
        action: "CreateApprovalRuleTemplateCommand",
        parameters: {
          approvalRuleTemplateName: this.approvalRuleTemplateName,
          approvalRuleTemplateContent: JSON.stringify({
            Version: "2018-11-08",
            DestinationReferences: props.destinationReferences ?? ["*"],
            Statements: [
              {
                Type: "Approvers",
                ApprovalPoolMembers: props.approvalPoolMembers?.map(
                  (member) => `CodeCommitApprovers:${member.name}/*`
                ),
                NumberOfApprovalsNeeded: props.numberOfApprovalsNeeded,
              },
            ],
          } satisfies ApprovalRuleTemplateContent),
          approvalRuleTemplateDescription: props.description,
        },
        physicalResourceId: PhysicalResourceId.fromResponse(
          "approvalRuleTemplate.approvalRuleTemplateId"
        ),
      },
      onUpdate: {
        service: "@aws-sdk/client-codecommit",
        action: "UpdateApprovalRuleTemplateContentCommand",
        parameters: {
          approvalRuleTemplateName: this.approvalRuleTemplateName,
          newRuleContent: JSON.stringify({
            Version: "2018-11-08",
            DestinationReferences: props.destinationReferences ?? ["*"],
            Statements: [
              {
                Type: "Approvers",
                ApprovalPoolMembers: props.approvalPoolMembers?.map(
                  (member) => `CodeCommitApprovers:${member.name}/*`
                ),
                NumberOfApprovalsNeeded: props.numberOfApprovalsNeeded,
              },
            ],
          } satisfies ApprovalRuleTemplateContent),
        },
        physicalResourceId: PhysicalResourceId.fromResponse(
          "approvalRuleTemplate.approvalRuleTemplateId"
        ),
      },
      onDelete: {
        service: "@aws-sdk/client-codecommit",
        action: "DeleteApprovalRuleTemplateCommand",
        parameters: {
          approvalRuleTemplateName: this.approvalRuleTemplateName,
        },
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: ["*"],
      }),
    });

    props.repositories?.forEach((repository, index) => {
      const associate = new AssociateApprovalRuleTemplate(
        this,
        `Associate${index}`,
        {
          repository,
          approvalRuleTemplate: this,
        }
      );
      associate.node.addDependency(resource);
    });
  }
}
