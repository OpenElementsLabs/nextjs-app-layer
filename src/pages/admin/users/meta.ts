import { Users as UsersIcon } from "lucide-react";
import { ROLE_IT_ADMIN } from "../../../lib/roles.js";
import type { AppLayerTranslations } from "../../../translations/provider.js";

export const usersPageMeta = {
  defaultRoute: "/admin/users",
  icon: UsersIcon,
  label: (t: AppLayerTranslations) => t.nav.users,
  requiredRole: ROLE_IT_ADMIN,
} as const;
