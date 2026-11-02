import { readFileSync } from "node:fs";

export function readSchema() {
  const text = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  return [...text.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(([, name, body]) => {
    const fields = [...body.matchAll(/^\s+(\w+)\s+([\w?\[\]]+)(.*)$/gm)].map(([, name, type, attributes]) => ({
      name, type, attributes, column: attributes.match(/@map\("([^"]+)"\)/)?.[1],
    }));
    return { name, delegate: name[0].toLowerCase() + name.slice(1),
      table: body.match(/@@map\("([^"]+)"\)/)![1], fields,
      uniques: [
        ...fields.filter((field) => /@(?:id|unique)\b/.test(field.attributes)).map((field) => [field.name]),
        ...[...body.matchAll(/@@(?:id|unique)\(\[([^\]]+)\]/g)].map((match) => match[1].split(",").map((field) => field.trim())),
      ],
      relations: fields.flatMap((field) => {
        const match = field.attributes.match(/@relation\("[^"]+", fields: \[([^\]]+)\], references: \[([^\]]+)\]/);
        return match ? [{ target: field.type.replace("?", ""),
          fields: match[1].split(",").map((value) => value.trim()),
          references: match[2].split(",").map((value) => value.trim()) }] : [];
      }),
    };
  });
}
