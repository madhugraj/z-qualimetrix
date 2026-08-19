import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Unplug } from "lucide-react";
import { GlassPanel } from "@/components/qm/GlassPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { API_V1_URL } from "@/lib/api-config";
import { useAuth } from "@/lib/auth-context";

const ROLE_OPTIONS = [
  { value: "pm", label: "PM" },
  { value: "po", label: "Product Owner" },
  { value: "executive", label: "Leadership" },
  { value: "developer", label: "Developer" },
  { value: "tester", label: "Tester" },
  { value: "unassigned", label: "Unassigned" },
];

const SCOPED_ROLES = ["po", "developer", "tester"];

interface TenantUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
}

interface Membership {
  userId: string;
  role: string;
  accessibleProducts: string[];
}

interface ProductLite {
  id: string;
  name: string;
}

interface Delegation {
  id: string;
  productId: string;
  product: ProductLite;
  grantee: { id: string; name: string | null; email: string };
  createdAt: string;
}

interface RowEdit {
  role: string;
  accessibleProducts: string[];
}

export function TeamManagementPanel() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  const [users, setUsers] = useState<TenantUser[]>([]);
  const [memberships, setMemberships] = useState<Record<string, Membership>>({});
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [usersRes, membershipsRes, productsRes, delegationsRes] = await Promise.all([
        fetch(`${API_V1_URL}/tenants/${tenantId}/users?limit=100`, { credentials: "include" }),
        fetch(`${API_V1_URL}/memberships`, { credentials: "include" }),
        fetch(`${API_V1_URL}/products?limit=100`, { credentials: "include" }),
        fetch(`${API_V1_URL}/memberships/delegations`, { credentials: "include" }),
      ]);
      const [usersData, membershipsData, productsData, delegationsData] = await Promise.all([
        usersRes.json(),
        membershipsRes.json(),
        productsRes.json(),
        delegationsRes.json(),
      ]);
      if (usersData.success) setUsers(usersData.data.users);
      if (membershipsData.success) {
        const map: Record<string, Membership> = {};
        for (const m of membershipsData.data.memberships) map[m.userId] = m;
        setMemberships(map);
      }
      if (productsData.success) setProducts(productsData.data.products);
      if (delegationsData.success) setDelegations(delegationsData.data.delegations);
    } catch (error) {
      console.error("Failed to load team data:", error);
      toast.error("Failed to load team data");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const originalOf = (u: TenantUser): RowEdit => ({
    role: u.role,
    accessibleProducts: memberships[u.id]?.accessibleProducts ?? [],
  });
  const rowStateOf = (u: TenantUser): RowEdit => edits[u.id] ?? originalOf(u);
  const isDirty = (u: TenantUser) => {
    const edit = edits[u.id];
    if (!edit) return false;
    const original = originalOf(u);
    return (
      edit.role !== original.role ||
      JSON.stringify([...edit.accessibleProducts].sort()) !== JSON.stringify([...original.accessibleProducts].sort())
    );
  };

  const setRowRole = (u: TenantUser, role: string) => {
    setEdits((prev) => ({ ...prev, [u.id]: { ...rowStateOf(u), role } }));
  };
  const toggleRowProduct = (u: TenantUser, productId: string) => {
    const current = rowStateOf(u);
    const accessibleProducts = current.accessibleProducts.includes(productId)
      ? current.accessibleProducts.filter((id) => id !== productId)
      : [...current.accessibleProducts, productId];
    setEdits((prev) => ({ ...prev, [u.id]: { ...current, accessibleProducts } }));
  };

  async function saveRow(u: TenantUser) {
    const state = rowStateOf(u);
    setSavingUserId(u.id);
    try {
      const res = await fetch(`${API_V1_URL}/memberships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: u.id, role: state.role, accessibleProducts: state.accessibleProducts }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to update role");
      toast.success(`Updated ${u.name || u.email}`);
      setEdits((prev) => {
        const next = { ...prev };
        delete next[u.id];
        return next;
      });
      loadAll();
    } catch (error) {
      toast.error("Failed to update role", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setSavingUserId(null);
    }
  }

  async function revokeDelegation(id: string) {
    try {
      const res = await fetch(`${API_V1_URL}/memberships/delegations/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to revoke");
      toast.success("Delegation revoked");
      setDelegations((prev) => prev.filter((d) => d.id !== id));
    } catch (error) {
      toast.error("Failed to revoke delegation", { description: error instanceof Error ? error.message : undefined });
    }
  }

  if (!tenantId || loading) {
    return (
      <GlassPanel title="Team members">
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </GlassPanel>
    );
  }

  return (
    <>
      <GlassPanel
        title="Team members"
        subtitle="Assign roles and product scope"
        action={<AddTeammateDialog tenantId={tenantId} onCreated={loadAll} />}
      >
        <div className="space-y-2">
          {users.map((u) => {
            const state = rowStateOf(u);
            const dirty = isDirty(u);
            return (
              <div key={u.id} className="rounded-xl border border-glass-border/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{u.name || u.email}</p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={state.role}
                      onChange={(e) => setRowRole(u, e.target.value)}
                      className="rounded-md border border-glass-border bg-transparent px-2 py-1.5 text-sm"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      disabled={!dirty || savingUserId === u.id}
                      onClick={() => saveRow(u)}
                    >
                      {savingUserId === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                    </Button>
                  </div>
                </div>

                {SCOPED_ROLES.includes(state.role) && (
                  <div className="mt-3 flex flex-wrap gap-3 border-t border-glass-border/60 pt-3">
                    {products.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No products yet.</p>
                    ) : (
                      products.map((p) => (
                        <label key={p.id} className="flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={state.accessibleProducts.includes(p.id)}
                            onChange={() => toggleRowProduct(u, p.id)}
                            className="h-3.5 w-3.5 rounded border-glass-border"
                          />
                          {p.name}
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </GlassPanel>

      <DelegationsPanel
        delegations={delegations}
        products={products}
        pos={users.filter((u) => u.role === "po")}
        onGranted={loadAll}
        onRevoke={revokeDelegation}
      />
    </>
  );
}

function AddTeammateDialog({ tenantId, onCreated }: { tenantId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("unassigned");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!email.trim() || !password.trim()) {
      toast.error("Email and password are required");
      return;
    }
    setSubmitting(true);
    try {
      const userRes = await fetch(`${API_V1_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenantId, email: email.trim(), name: name.trim() || undefined, password, role }),
      });
      const userData = await userRes.json();
      if (!userRes.ok || !userData.success) throw new Error(userData.error ?? "Failed to create user");

      const membershipRes = await fetch(`${API_V1_URL}/memberships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: userData.data.id, role }),
      });
      const membershipData = await membershipRes.json();
      if (!membershipRes.ok || !membershipData.success) throw new Error(membershipData.error ?? "Failed to assign role");

      toast.success(`${email.trim()} added`, { description: `Role: ${role}` });
      setEmail("");
      setName("");
      setPassword("");
      setRole("unassigned");
      setOpen(false);
      onCreated();
    } catch (error) {
      toast.error("Failed to add teammate", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" strokeWidth={2} />
          Add teammate
        </Button>
      </DialogTrigger>
      <DialogContent className="glass sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add teammate</DialogTitle>
          <DialogDescription>Creates their account and assigns a starting role in one step.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="teammate-email">Work email</Label>
            <Input id="teammate-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="teammate-name">Name</Label>
            <Input id="teammate-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="teammate-password">Temporary password</Label>
            <Input
              id="teammate-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="teammate-role">Role</Label>
            <select
              id="teammate-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-md border border-glass-border bg-transparent px-3 py-2 text-sm"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add teammate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DelegationsPanel({
  delegations,
  products,
  pos,
  onGranted,
  onRevoke,
}: {
  delegations: Delegation[];
  products: ProductLite[];
  pos: TenantUser[];
  onGranted: () => void;
  onRevoke: (id: string) => void;
}) {
  const [productId, setProductId] = useState("");
  const [granteeId, setGranteeId] = useState("");
  const [granting, setGranting] = useState(false);

  async function grant() {
    if (!productId || !granteeId) {
      toast.error("Pick a product and a PO");
      return;
    }
    setGranting(true);
    try {
      const res = await fetch(`${API_V1_URL}/memberships/delegations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productId, granteeId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to grant delegation");
      toast.success("Delegation granted");
      setProductId("");
      setGranteeId("");
      onGranted();
    } catch (error) {
      toast.error("Failed to grant delegation", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setGranting(false);
    }
  }

  return (
    <GlassPanel
      title="Delegations"
      subtitle="PM-granted, per-product Jira/ADO mapping rights"
      className="mt-4"
    >
      <div className="space-y-4">
        {delegations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-glass-border p-6 text-center text-xs text-muted-foreground">
            No active delegations.
          </p>
        ) : (
          <ul className="space-y-2">
            {delegations.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-glass-border/60 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.product.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.grantee.name || d.grantee.email} · granted {new Date(d.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-critical hover:text-critical"
                  onClick={() => onRevoke(d.id)}
                >
                  <Unplug className="h-4 w-4" />
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-3 border-t border-glass-border/60 pt-3">
          <div className="space-y-1.5">
            <Label>Product</Label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="rounded-md border border-glass-border bg-transparent px-3 py-2 text-sm"
            >
              <option value="">Choose a product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Product Owner</Label>
            <select
              value={granteeId}
              onChange={(e) => setGranteeId(e.target.value)}
              className="rounded-md border border-glass-border bg-transparent px-3 py-2 text-sm"
            >
              <option value="">Choose a PO…</option>
              {pos.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email}
                </option>
              ))}
            </select>
          </div>
          <Button size="sm" onClick={grant} disabled={granting} className="gap-1.5">
            {granting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Grant delegation"}
          </Button>
        </div>
      </div>
    </GlassPanel>
  );
}
