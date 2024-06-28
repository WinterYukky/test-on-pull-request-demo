import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { TestOnPullRequestDemoStack } from "../lib/test-on-pull-request-demo-stack";

test("snapshot test", () => {
  const app = new App();
  const stack = new TestOnPullRequestDemoStack(app, "MyTestStack");
  const template = Template.fromStack(stack).toJSON();
  expect(template).toMatchSnapshot();
});
