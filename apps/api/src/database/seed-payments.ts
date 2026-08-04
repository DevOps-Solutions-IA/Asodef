import { PrismaClient } from "@prisma/client";

/**
 * Demo-only data for local testing (US-021's own stated purpose -
 * "for local testing", never customer-facing content). Clearly fake:
 * synthetic names, @example.com emails, obviously-labeled demo plan.
 * Never run against a real database with real customer data.
 *
 * Idempotent: Customer upserts on its natural (documentType,
 * documentNumber) key, Plan upserts on its unique name. Obligation has
 * no PRD-given unique key, so it's a manual find-or-create keyed on
 * (customerId, concept) instead of a DB-level upsert.
 */
export async function seedPayments(client: PrismaClient): Promise<void> {
  const plan = await client.plan.upsert({
    where: { name: "Plan Demo" },
    update: {},
    create: {
      name: "Plan Demo",
      description: "Plan de prueba para entorno local - no es un plan comercial real.",
      active: true,
    },
  });

  const demoCustomers = [
    {
      documentType: "CC",
      documentNumber: "1000000001",
      fullName: "Cliente Demo Uno",
      email: "cliente.demo.uno@example.com",
      phone: "3000000001",
      obligationConcept: "Cuota de prueba - Cliente Demo Uno",
      amountCents: 5_000_000,
    },
    {
      documentType: "CC",
      documentNumber: "1000000002",
      fullName: "Cliente Demo Dos",
      email: "cliente.demo.dos@example.com",
      phone: "3000000002",
      obligationConcept: "Cuota de prueba - Cliente Demo Dos",
      amountCents: 7_500_000,
    },
  ] as const;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 15);

  for (const demo of demoCustomers) {
    const customer = await client.customer.upsert({
      where: { documentType_documentNumber: { documentType: demo.documentType, documentNumber: demo.documentNumber } },
      update: { fullName: demo.fullName, email: demo.email, phone: demo.phone },
      create: {
        documentType: demo.documentType,
        documentNumber: demo.documentNumber,
        fullName: demo.fullName,
        email: demo.email,
        phone: demo.phone,
      },
    });

    const existingObligation = await client.obligation.findFirst({
      where: { customerId: customer.id, concept: demo.obligationConcept },
    });

    if (!existingObligation) {
      await client.obligation.create({
        data: {
          customerId: customer.id,
          planId: plan.id,
          concept: demo.obligationConcept,
          amountCents: demo.amountCents,
          currency: "COP",
          dueDate,
          status: "PENDING",
        },
      });
    }
  }
}
