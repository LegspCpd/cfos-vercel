import { prisma } from './db';
import { BUNDLED_FORMATS, serializeTemplateVariants } from './formats';

// ---------------------------------------------------------------------------
// Idempotent seeding of the bundled output formats. Called on first use (lazily
// from the formats API) so a fresh deployment gets its standard formats without
// any deploy-time hook — mirroring the original OS's "first visitor provisions
// the deployment" behavior.
//
// Bundled formats are upserted by their blueprintId: an upgrade can replace their
// contents (template files, description, agentHint) but never resets the admin's
// curation (enabled flag, presentation overrides) — those are the admin's own.
// ---------------------------------------------------------------------------

let seedPromise: Promise<void> | null = null;

export async function seedBundledFormats(): Promise<void> {
  // Single-flight: concurrent first requests all await the same seed.
  if (!seedPromise) {
    seedPromise = (async () => {
      for (const format of BUNDLED_FORMATS) {
        const existing = await prisma.outputFormat.findUnique({ where: { id: format.id } });
        if (existing) {
          // Upgrade content but preserve the admin's curation (enabled, presentation).
          await prisma.outputFormat.update({
            where: { id: format.id },
            data: {
              title: format.title,
              description: format.description,
              outputId: format.output.id,
              noun: format.output.noun,
              plural: format.output.plural,
              icon: format.output.icon,
              agentHint: format.agentHint,
              templateFiles: serializeTemplateVariants(format.variants),
              isBundled: true,
              status: 'bundled',
            },
          });
        } else {
          await prisma.outputFormat.create({
            data: {
              id: format.id,
              title: format.title,
              description: format.description,
              outputId: format.output.id,
              noun: format.output.noun,
              plural: format.output.plural,
              icon: format.output.icon,
              agentHint: format.agentHint,
              templateFiles: serializeTemplateVariants(format.variants),
              isBundled: true,
              enabled: true,
              status: 'bundled',
            },
          });
        }
      }
    })().catch((err) => {
      // Reset so a transient DB failure doesn't permanently disable seeding.
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}