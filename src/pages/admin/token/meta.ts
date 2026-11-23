import { KeyRound } from "lucide-react";
import { ROLE_IT_ADMIN } from "../../../lib/roles.js";
import type { AppLayerTranslations } from "../../../translations/provider.js";

export const bearerTokenPageMeta = {
  defaultRoute: "/admin/token",
  icon: KeyRound,
  label: (t: AppLayerTranslations) => t.nav.bearerToken,
  requiredRole: ROLE_IT_ADMIN,
} as const;
