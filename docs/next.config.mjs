import { createMDX } from 'fumadocs-mdx';
import { withFumadocs } from 'fumadocs-ui/next';

const withMDX = createMDX();

export default withMDX(
  withFumadocs({
    output: 'export',
  }),
);
