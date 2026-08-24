import {
  contactListQuerySchema,
  createContactSchema,
  PERMISSION_KEYS,
  updateContactSchema,
  type ContactListQuery,
} from "@nbs/shared";
import { Router } from "express";
import { authenticate, requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/require-permission";
import { validate, parsedQuery } from "../middleware/validate";
import {
  createContact,
  deleteContact,
  getContact,
  listContactOptions,
  listContacts,
  updateContact,
} from "../services/contacts.service";

export const contactsRouter = Router();

contactsRouter.use(authenticate, requireAuth);

contactsRouter.get(
  "/",
  requirePermission(PERMISSION_KEYS.CONTACTS_VIEW),
  validate(contactListQuerySchema, "query"),
  async (req, res) => {
    const result = await listContacts(parsedQuery<ContactListQuery>(req));
    res.json({ data: result });
  },
);

contactsRouter.get(
  "/options",
  requirePermission(PERMISSION_KEYS.CONTACTS_VIEW),
  async (req, res) => {
    const companyId =
      typeof req.query.companyId === "string" ? req.query.companyId : undefined;
    const contacts = await listContactOptions(companyId);
    res.json({ data: { contacts } });
  },
);

contactsRouter.get(
  "/:id",
  requirePermission(PERMISSION_KEYS.CONTACTS_VIEW),
  async (req, res) => {
    const contact = await getContact(String(req.params.id));
    res.json({ data: { contact } });
  },
);

contactsRouter.post(
  "/",
  requirePermission(PERMISSION_KEYS.CONTACTS_CREATE),
  validate(createContactSchema),
  async (req, res) => {
    const contact = await createContact(req.body);
    res.status(201).json({ data: { contact } });
  },
);

contactsRouter.patch(
  "/:id",
  requirePermission(PERMISSION_KEYS.CONTACTS_UPDATE),
  validate(updateContactSchema),
  async (req, res) => {
    const contact = await updateContact(String(req.params.id), req.body);
    res.json({ data: { contact } });
  },
);

contactsRouter.delete(
  "/:id",
  requirePermission(PERMISSION_KEYS.CONTACTS_DELETE),
  async (req, res) => {
    await deleteContact(String(req.params.id));
    res.json({ data: { ok: true } });
  },
);
