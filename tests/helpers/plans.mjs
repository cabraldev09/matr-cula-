// Organizations start without modules; tests that exercise attendance data activate a plan first.
export async function activatePlan(admin, organizationId, code = "completo", status = "active") {
  const { data: plan, error } = await admin.from("plans").select("id").eq("code", code).single();
  if (error) throw error;
  const result = await admin.from("subscriptions").upsert({
    organization_id: organizationId,
    plan_id: plan.id,
    status,
    current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
  });
  if (result.error) throw result.error;
}
