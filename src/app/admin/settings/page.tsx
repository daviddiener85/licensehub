import Link from "next/link";

import { DatabaseSetup } from "@/components/database-setup";
import { prisma } from "@/lib/prisma";
import { formatRetentionSetting } from "@/lib/retention";
import {
  createService,
  createUser,
  updateAdminWorkspaceSetting,
  updateRetentionSetting,
  updateService,
  updateUser,
  updateUserStatus,
} from "@/lib/settings-actions";

export const dynamic = "force-dynamic";

async function getSettingsData() {
  const [services, retentionSetting, users] = await Promise.all([
    prisma.service.findMany({
      orderBy: { name: "asc" },
    }),
    prisma.retentionSetting.findUnique({
      where: { id: "default" },
    }),
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
  ]);

  return { services, retentionSetting, users };
}

function whatsappHref(cellphone?: string | null) {
  if (!cellphone) {
    return null;
  }

  const digits = cellphone.replace(/\D/g, "");
  const international = digits.startsWith("0") ? `27${digits.slice(1)}` : digits;
  return `https://wa.me/${international}`;
}

export default async function AdminSettingsPage() {
  const data = await getSettingsData().catch((error: unknown) => {
    console.error(error);
    return null;
  });

  if (!data) {
    return <DatabaseSetup message="Administration settings could not be loaded from PostgreSQL." />;
  }

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#1f2724]">
      <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8">
        <header className="flex flex-col gap-4 border-b border-[#d8d1c3] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/admin" className="text-sm font-medium text-[#6b5e4f]">
              Back to admin
            </Link>
            <h1 className="mt-4 text-3xl font-semibold">Administration Settings</h1>
            <p className="mt-2 text-sm text-[#52615b]">
              Manage services, prices, retention rules, and admin or supplier access.
            </p>
          </div>
        </header>

        <section className="mt-6">
          <div className="border border-[#d8d1c3] bg-white p-5">
            <h2 className="text-xl font-semibold">Services and Products</h2>
            <div className="mt-5 space-y-4">
              {data.services.map((service) => (
                <form
                  key={service.id}
                  action={updateService}
                  className="border border-[#eee8dc] bg-[#fffdf8] p-4"
                >
                  <input type="hidden" name="serviceId" value={service.id} />
                  <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
                    <label className="text-sm font-semibold">
                      Name
                      <input
                        className="mt-2 h-11 w-full border border-[#d8d1c3] bg-white px-3 font-normal outline-none"
                        defaultValue={service.name}
                        name="name"
                        required
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      Description
                      <input
                        className="mt-2 h-11 w-full border border-[#d8d1c3] bg-white px-3 font-normal outline-none"
                        defaultValue={service.description}
                        name="description"
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap items-end gap-4">
                    <label className="w-40 text-sm font-semibold">
                      Price
                      <input
                        className="mt-2 h-11 w-full border border-[#d8d1c3] bg-white px-3 font-normal outline-none"
                        defaultValue={service.basePrice.toString()}
                        min="0"
                        name="basePrice"
                        required
                        step="0.01"
                        type="number"
                      />
                    </label>
                    <label className="flex h-11 items-center gap-2 text-sm font-semibold">
                      <input defaultChecked={service.isActive} name="isActive" type="checkbox" />
                      Active
                    </label>
                    <button className="h-11 border border-[#1f2724] bg-[#1f2724] px-5 text-sm font-semibold text-white">
                      Save
                    </button>
                  </div>
                </form>
              ))}
            </div>

            <form
              action={createService}
              className="mt-4 border border-[#d8d1c3] bg-[#fffdf8] p-4"
            >
              <h3 className="text-sm font-semibold text-[#6b5e4f]">Add Service</h3>
              <div className="mt-3 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
                <input
                  className="h-11 border border-[#d8d1c3] bg-white px-3 text-sm outline-none"
                  name="name"
                  placeholder="New service name"
                  required
                />
                <input
                  className="h-11 border border-[#d8d1c3] bg-white px-3 text-sm outline-none"
                  name="description"
                  placeholder="Description"
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <input
                  className="h-11 w-40 border border-[#d8d1c3] bg-white px-3 text-sm outline-none"
                  min="0"
                  name="basePrice"
                  placeholder="Price"
                  required
                  step="0.01"
                  type="number"
                />
                <label className="flex h-11 items-center gap-2 text-sm font-semibold">
                  <input defaultChecked name="isActive" type="checkbox" />
                  Active
                </label>
                <button className="h-11 border border-[#1f2724] bg-[#1f2724] px-5 text-sm font-semibold text-white">
                  Add Service
                </button>
              </div>
            </form>
          </div>

          <aside className="mt-5 border border-[#d8d1c3] bg-white p-5">
            <h2 className="text-xl font-semibold">Retention</h2>
            <p className="mt-3 text-sm leading-6 text-[#52615b]">
              {formatRetentionSetting(data.retentionSetting?.daysAfterCompletion)}
            </p>
            <form action={updateRetentionSetting} className="mt-6 flex flex-wrap items-end gap-4">
              <label className="block w-full max-w-sm text-sm font-semibold">
                Days after dispatched or cancelled
                <input
                  className="mt-2 h-10 w-full border border-[#d8d1c3] bg-[#fffdf8] px-3 font-normal outline-none"
                  defaultValue={data.retentionSetting?.daysAfterCompletion ?? ""}
                  min="0"
                  name="daysAfterCompletion"
                  placeholder="Leave blank until decided"
                  type="number"
                />
              </label>
              <input name="updatedByName" type="hidden" value="License Hub Admin" />
              <button className="h-10 border border-[#1f2724] bg-[#1f2724] px-4 text-sm font-semibold text-white">
                Save Retention
              </button>
            </form>
          </aside>

          <aside className="mt-5 border border-[#d8d1c3] bg-white p-5">
            <h2 className="text-xl font-semibold">Admin Workspace</h2>
            <p className="mt-3 text-sm leading-6 text-[#52615b]">
              Control how often the admin order list refreshes while the workspace is open.
            </p>
            <form action={updateAdminWorkspaceSetting} className="mt-6 flex flex-wrap items-end gap-4">
              <label className="flex h-10 items-center gap-2 text-sm font-semibold">
                <input
                  defaultChecked={data.retentionSetting?.adminAutoRefreshEnabled ?? true}
                  name="adminAutoRefreshEnabled"
                  type="checkbox"
                />
                Enable auto-refresh
              </label>
              <label className="block w-full max-w-sm text-sm font-semibold">
                Refresh interval in seconds
                <input
                  className="mt-2 h-10 w-full border border-[#d8d1c3] bg-[#fffdf8] px-3 font-normal outline-none"
                  defaultValue={data.retentionSetting?.adminRefreshIntervalSeconds ?? 30}
                  max="600"
                  min="5"
                  name="adminRefreshIntervalSeconds"
                  type="number"
                />
              </label>
              <input name="updatedByName" type="hidden" value="License Hub Admin" />
              <button className="h-10 border border-[#1f2724] bg-[#1f2724] px-4 text-sm font-semibold text-white">
                Save Refresh
              </button>
            </form>
          </aside>
        </section>

        <section className="mt-6 border border-[#d8d1c3] bg-white p-5">
          <h2 className="text-xl font-semibold">Users</h2>
          <div className="mt-5 space-y-4">
            {data.users.map((user) => (
              <div key={user.id} className="border border-[#eee8dc] bg-[#fffdf8] p-4">
                <form action={updateUser}>
                  <input type="hidden" name="userId" value={user.id} />
                  <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr_0.8fr]">
                    <label className="text-sm font-semibold">
                      Name
                      <input
                        className="mt-2 h-11 w-full border border-[#d8d1c3] bg-white px-3 font-normal outline-none"
                        defaultValue={user.name}
                        name="name"
                        required
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      Email
                      <input
                        className="mt-2 h-11 w-full border border-[#d8d1c3] bg-white px-3 font-normal outline-none"
                        defaultValue={user.email}
                        name="email"
                        required
                        type="email"
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      Cellphone
                      <span className="mt-2 flex gap-2">
                        <input
                          className="h-11 min-w-0 flex-1 border border-[#d8d1c3] bg-white px-3 font-normal outline-none"
                          defaultValue={user.cellphone ?? ""}
                          name="cellphone"
                          required
                        />
                        {user.cellphone ? (
                          <a
                            className="flex h-11 items-center border border-[#d8d1c3] px-3 text-sm font-semibold text-[#6b5e4f]"
                            href={whatsappHref(user.cellphone) ?? "#"}
                            rel="noreferrer"
                            target="_blank"
                          >
                            WhatsApp
                          </a>
                        ) : null}
                      </span>
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    <label className="text-sm font-semibold">
                      Role
                      <select
                        className="mt-2 h-11 border border-[#d8d1c3] bg-white px-3 font-normal outline-none"
                        defaultValue={user.role}
                        name="role"
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="SUPPLIER">Supplier</option>
                      </select>
                    </label>
                    <label className="text-sm font-semibold">
                      Status
                      <select
                        className="mt-2 h-11 border border-[#d8d1c3] bg-white px-3 font-normal outline-none"
                        defaultValue={user.status}
                        name="status"
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                      </select>
                    </label>
                    <button className="mt-7 h-11 border border-[#1f2724] bg-[#1f2724] px-5 text-sm font-semibold text-white">
                      Save User
                    </button>
                  </div>
                </form>
                <form action={updateUserStatus} className="mt-3">
                  <input type="hidden" name="userId" value={user.id} />
                  <input type="hidden" name="status" value={user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} />
                  <button className="border border-[#d8d1c3] px-3 py-2 text-sm font-semibold text-[#6b5e4f]">
                    {user.status === "ACTIVE" ? "Deactivate User" : "Activate User"}
                  </button>
                </form>
              </div>
            ))}
          </div>

          <form action={createUser} className="mt-6 grid gap-3 border border-[#d8d1c3] bg-[#fffdf8] p-4 md:grid-cols-[1fr_1.2fr_0.8fr_0.7fr_auto]">
            <input className="border border-[#d8d1c3] bg-white p-2 text-sm outline-none" name="name" placeholder="Full name" required />
            <input className="border border-[#d8d1c3] bg-white p-2 text-sm outline-none" name="email" placeholder="Email" required type="email" />
            <input className="border border-[#d8d1c3] bg-white p-2 text-sm outline-none" name="cellphone" placeholder="Cellphone" required />
            <select className="border border-[#d8d1c3] bg-white p-2 text-sm outline-none" name="role" required>
              <option value="ADMIN">Admin</option>
              <option value="SUPPLIER">Supplier</option>
            </select>
            <button className="border border-[#1f2724] bg-[#1f2724] px-4 py-2 text-sm font-semibold text-white">
              Add User
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
