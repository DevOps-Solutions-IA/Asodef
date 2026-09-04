import { render, screen } from "@testing-library/react";
import { ProviderDataView } from "./ProviderDataView";

describe("ProviderDataView account statement", () => {
  it("renders the certified Master balance fields with public labels", () => {
    render(<ProviderDataView data={{
      status: "EN_MORA",
      balance: "12500",
      currency: "COP",
      overdueBalance: "7500",
      currentBalance: "5000",
      overdueCount: 1,
      currentCount: 1,
      contractCount: 1,
    }} />);

    expect(screen.getByText("Saldo")).toBeInTheDocument();
    expect(screen.getByText("12500")).toBeInTheDocument();
    expect(screen.getByText("Saldo vencido")).toBeInTheDocument();
    expect(screen.getByText("7500")).toBeInTheDocument();
    expect(screen.getByText("Cuota vigente")).toBeInTheDocument();
    expect(screen.getByText("5000")).toBeInTheDocument();
    expect(screen.getByText("Cuotas vencidas")).toBeInTheDocument();
    expect(screen.getByText("Contratos")).toBeInTheDocument();
  });
});
