import { Resource } from "aws-cdk-lib";
import { IRepository } from "aws-cdk-lib/aws-codecommit";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { IApprovalRuleTemplate } from "./approval-rule-template";

export interface AssociateApprovalRuleTemplateProps {
  approvalRuleTemplate: IApprovalRuleTemplate;
  repository: IRepository;
}

export class AssociateApprovalRuleTemplate extends Resource {
  constructor(
    scope: Construct,
    id: string,
    props: AssociateApprovalRuleTemplateProps
  ) {
    super(scope, id);

    new AwsCustomResource(this, "Resource", {
      resourceType: "Custom::AssociateApprovalRuleTemplateWithRepository",
      onUpdate: {
        service: "@aws-sdk/client-codecommit",
        action: "AssociateApprovalRuleTemplateWithRepositoryCommand",
        parameters: {
          approvalRuleTemplateName:
            props.approvalRuleTemplate.approvalRuleTemplateName,
          repositoryName: props.repository.repositoryName,
        },
        physicalResourceId: PhysicalResourceId.of(this.node.id),
      },
      onDelete: {
        service: "@aws-sdk/client-codecommit",
        action: "DisassociateApprovalRuleTemplateFromRepositoryCommand",
        parameters: {
          approvalRuleTemplateName:
            props.approvalRuleTemplate.approvalRuleTemplateName,
          repositoryName: props.repository.repositoryName,
        },
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: ["*"],
      }),
    });
  }
}
