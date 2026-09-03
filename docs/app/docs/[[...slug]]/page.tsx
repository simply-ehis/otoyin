import { DocsPage } from 'fumadocs-ui/page';
import type { Metadata } from 'next';
import { source } from '../../../source';

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) return <div>Page not found</div>;

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc}>
      <MDX />
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) return {};

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
