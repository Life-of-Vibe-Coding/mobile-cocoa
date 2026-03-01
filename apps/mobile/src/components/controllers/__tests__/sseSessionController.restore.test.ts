jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

import { hydrateLastUsedProviderModel } from "../SseSessionController";

describe("hydrateLastUsedProviderModel", () => {
  it("hydrates legacy string payload as model only", () => {
    const setProvider = jest.fn();
    const setModel = jest.fn();

    hydrateLastUsedProviderModel("gpt-4o", setProvider, setModel);

    expect(setProvider).not.toHaveBeenCalled();
    expect(setModel).toHaveBeenCalledTimes(1);
    expect(setModel).toHaveBeenCalledWith("gpt-4o");
  });

  it("hydrates object payload with provider and model", () => {
    const setProvider = jest.fn();
    const setModel = jest.fn();

    hydrateLastUsedProviderModel({ provider: "gemini", model: "gemini-2.0-flash" }, setProvider, setModel);

    expect(setProvider).toHaveBeenCalledTimes(1);
    expect(setProvider).toHaveBeenCalledWith("gemini");
    expect(setModel).toHaveBeenCalledTimes(1);
    expect(setModel).toHaveBeenCalledWith("gemini-2.0-flash");
  });

  it("ignores malformed provider but still hydrates model", () => {
    const setProvider = jest.fn();
    const setModel = jest.fn();

    hydrateLastUsedProviderModel(null, setProvider, setModel);
    hydrateLastUsedProviderModel({}, setProvider, setModel);
    hydrateLastUsedProviderModel({ provider: 123 }, setProvider, setModel);
    hydrateLastUsedProviderModel({ provider: "unknown", model: "gpt-4o-mini" }, setProvider, setModel);

    expect(setProvider).not.toHaveBeenCalled();
    expect(setModel).toHaveBeenCalledTimes(1);
    expect(setModel).toHaveBeenCalledWith("gpt-4o-mini");
  });

  it("trims whitespace on provider and model values", () => {
    const setProvider = jest.fn();
    const setModel = jest.fn();

    hydrateLastUsedProviderModel({ provider: "  gemini  ", model: "  gemini-2.0-flash  " }, setProvider, setModel);

    expect(setProvider).toHaveBeenCalledTimes(1);
    expect(setProvider).toHaveBeenCalledWith("gemini");
    expect(setModel).toHaveBeenCalledTimes(1);
    expect(setModel).toHaveBeenCalledWith("gemini-2.0-flash");
  });

  it("trims whitespace from persisted model values", () => {
    const setProvider = jest.fn();
    const setModel = jest.fn();

    hydrateLastUsedProviderModel("  gpt-4o-mini  ", setProvider, setModel);

    expect(setProvider).not.toHaveBeenCalled();
    expect(setModel).toHaveBeenCalledTimes(1);
    expect(setModel).toHaveBeenCalledWith("gpt-4o-mini");
  });
});
