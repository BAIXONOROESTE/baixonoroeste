import { describe, it, expect } from "vitest";
import { isWithinBusinessHours, nextTenAmUtc } from "@/lib/email/notify.server";

function spLocal(year: number, month1to12: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, month1to12 - 1, day, hour, minute, 0));
}

describe("isWithinBusinessHours", () => {
  it("considera 10:00 como dentro do horário (limite inferior incluído)", () => {
    expect(isWithinBusinessHours(spLocal(2026, 7, 27, 10, 0))).toBe(true);
  });
  it("considera 21:59 como dentro do horário", () => {
    expect(isWithinBusinessHours(spLocal(2026, 7, 27, 21, 59))).toBe(true);
  });
  it("considera 22:00 como FORA do horário (limite superior excluído)", () => {
    expect(isWithinBusinessHours(spLocal(2026, 7, 27, 22, 0))).toBe(false);
  });
  it("considera 09:59 como fora do horário", () => {
    expect(isWithinBusinessHours(spLocal(2026, 7, 27, 9, 59))).toBe(false);
  });
  it("considera meia-noite como fora do horário", () => {
    expect(isWithinBusinessHours(spLocal(2026, 7, 27, 0, 0))).toBe(false);
  });
  it("considera 23:00 como fora do horário (o caso do exemplo original do Pedro)", () => {
    expect(isWithinBusinessHours(spLocal(2026, 7, 27, 23, 0))).toBe(false);
  });
  it("considera 12:30 como dentro do horário (o outro exemplo do Pedro)", () => {
    expect(isWithinBusinessHours(spLocal(2026, 7, 27, 12, 30))).toBe(true);
  });
});

describe("nextTenAmUtc", () => {
  it("se ainda não deu 10h hoje, agenda para as 10h de HOJE", () => {
    const spNow = spLocal(2026, 7, 27, 3, 0);
    expect(nextTenAmUtc(spNow).toISOString()).toBe("2026-07-27T13:00:00.000Z");
  });
  it("se já passou das 10h, agenda para as 10h de AMANHÃ (ex: marcado às 23h)", () => {
    const spNow = spLocal(2026, 7, 27, 23, 0);
    expect(nextTenAmUtc(spNow).toISOString()).toBe("2026-07-28T13:00:00.000Z");
  });
  it("atravessa corretamente a virada de mês", () => {
    const spNow = spLocal(2026, 7, 31, 23, 30);
    expect(nextTenAmUtc(spNow).toISOString()).toBe("2026-08-01T13:00:00.000Z");
  });
});
