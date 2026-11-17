import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

interface AppOpenApi {
  paths: Record<string, unknown>;
  components: {
    schemas: Record<string, unknown>;
    securitySchemes: Record<string, unknown>;
  };
}

function schemaReferences(value: unknown): string[] {
  const references = JSON.stringify(value).matchAll(/"\$ref":"#\/components\/schemas\/([^"]+)"/g);
  return Array.from(references, match => match[1]);
}

export function registerAppOpenApi(server: McpServer, readSnapshot: () => string): void {
  const template = new ResourceTemplate("horizon://api/openapi/{family}", { list: undefined });
  let bundledSpec: AppOpenApi | undefined;
  server.registerResource("app-openapi", template, {
    title: "App OpenAPI by endpoint family",
    description: "Read the operation details and schemas for a family listed in horizon://api/reference.",
    mimeType: "application/json",
  }, (uri, { family }) => {
    bundledSpec ??= JSON.parse(readSnapshot()) as AppOpenApi;
    const prefix = `/api/v1/app/${family}`;
    const paths = Object.fromEntries(Object.entries(bundledSpec.paths)
      .filter(([path]) => path === prefix || path.startsWith(prefix + "/")));
    if (!Object.keys(paths).length) throw new Error("Unknown App API family. See horizon://api/reference.");

    const { paths: _allPaths, components, ...common } = bundledSpec;
    const names = new Set(schemaReferences(paths));
    for (const name of names) {
      const schema = components.schemas[name];
      if (!schema) throw new Error(`Missing schema definition: ${name}`);
      for (const ref of schemaReferences(schema)) names.add(ref);
    }
    const schemas = Object.fromEntries([...names].map(name => [name, components.schemas[name]]));
    const section = { ...common, paths, components: { ...components, schemas } };
    return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(section) }] };
  });
}
