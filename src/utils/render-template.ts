import fs from "fs";
import path from "path";
import handlebars from "handlebars";

export const renderTemplate = (
  templateName: string,
  data: Record<string, any>
) => {
  const filePath = path.join(
    process.cwd(),
    "src",
    "core",
    "templates",
    `${templateName}.hbs`
  );
  const source = fs.readFileSync(filePath, "utf8");
  const template = handlebars.compile(source);
  return template(data);
};
