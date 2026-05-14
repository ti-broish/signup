import React, { useState } from "react";
import { WIDGETS } from "../constants";
import { WidgetMetadata } from "../types";

const WidgetPortal: React.FC = () => {
  // Set SignUpWidget as the default selected widget
  const defaultWidget = WIDGETS.find((w) => w.id === "signup") || WIDGETS[0];
  const [selectedWidget, setSelectedWidget] = useState<WidgetMetadata | null>(
    defaultWidget,
  );
  const [privacyUrl, setPrivacyUrl] = useState<string>("");
  const [baseUrl, setBaseUrl] = useState<string>("");

  const getWidgetUrl = (id: string, includeParams: boolean = false) => {
    // Use custom base URL if provided, otherwise use current location
    const urlBase = baseUrl || window.location.href.split("#")[0];
    let url = `${urlBase}#/widget/${id}`;

    // Add query parameters for SignUpWidget
    if (includeParams && id === "signup" && privacyUrl) {
      url += `?privacyUrl=${encodeURIComponent(privacyUrl)}`;
    }

    return url;
  };

  const getIframeCode = (widget: WidgetMetadata) => {
    const url = getWidgetUrl(widget.id, true);
    return `<iframe src="${url}" width="${widget.defaultWidth}" height="${widget.defaultHeight}" allow="web-share" style="border:none; border-radius:12px; overflow:hidden;"></iframe>`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Embed code copied!");
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-indigo-900 text-white flex flex-col">
        <div className="p-6 border-b border-indigo-800">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <i className="fas fa-layer-group"></i> Portal
          </h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {WIDGETS.map((widget) => (
            <button
              key={widget.id}
              onClick={() => setSelectedWidget(widget)}
              className={`w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3 ${
                selectedWidget?.id === widget.id
                  ? "bg-indigo-700 shadow-inner"
                  : "hover:bg-indigo-800"
              }`}
            >
              <i className={`fas ${widget.icon} w-5`}></i>
              <span className="text-sm font-medium">{widget.name}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-indigo-800 text-xs text-indigo-400">
          WidgetPortal v1.0.0
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {selectedWidget ? (
          <div className="p-8 max-w-7xl mx-auto w-full">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-gray-800">
                {selectedWidget.name}
              </h2>
              <p className="text-gray-500 mt-2">{selectedWidget.description}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Preview */}
              <div className="space-y-6 sticky top-8">
                <div
                  className="shadow-lg overflow-auto relative p-4"
                  style={{
                    maxHeight: "calc(100vh - 200px)",
                    width: "fit-content",
                    maxWidth: "100%",
                  }}
                >
                  <iframe
                    src={getWidgetUrl(selectedWidget.id, true)}
                    className="border-none"
                    allow="web-share"
                    style={{
                      display: "block",
                      width: selectedWidget.defaultWidth,
                      height: selectedWidget.defaultHeight,
                    }}
                    title={selectedWidget.name}
                  />
                </div>
              </div>

              {/* Implementation */}
              <div className="space-y-6 flex flex-col">
                {/* General Configuration */}
                <section className="bg-white p-6 rounded-xl border border-gray-200">
                  <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                    <i className="fas fa-cog text-indigo-500"></i> Configuration
                  </h3>
                  <div className="space-y-4">
                    {/* Widget-specific Configuration for SignUpWidget */}
                    {selectedWidget.id === "signup" && (
                      <div>
                        <label
                          htmlFor="privacyUrl"
                          className="block text-sm font-medium text-gray-700 mb-2"
                        >
                          Privacy Policy URL{" "}
                          <span className="text-gray-400">(optional)</span>
                        </label>
                        <input
                          type="url"
                          id="privacyUrl"
                          value={privacyUrl}
                          onChange={(e) => setPrivacyUrl(e.target.value)}
                          placeholder="https://example.com/privacy-policy"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        />
                        <p className="mt-2 text-xs text-gray-500">
                          The URL that will be linked in the GDPR consent
                          checkbox. Leave empty to use the default "/privacy"
                          path.
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                <section>
                  <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
                    <i className="fas fa-code text-green-500"></i> Embed Code
                  </h3>
                  <div className="bg-gray-900 rounded-lg p-10 relative group">
                    <pre className="text-green-400 text-sm overflow-x-auto pr-16 mt-4">
                      {`<iframe\n  src="${getWidgetUrl(selectedWidget.id, true)}"\n  width="${selectedWidget.defaultWidth}"\n  height="${selectedWidget.defaultHeight}"\n  allow="web-share"\n  style="border:none; border-radius:12px; overflow:hidden;"\n></iframe>`}
                    </pre>
                    <button
                      onClick={() =>
                        copyToClipboard(getIframeCode(selectedWidget))
                      }
                      className="absolute top-6 right-6 bg-gray-700 text-white p-2 rounded hover:bg-gray-600 transition"
                    >
                      <i className="fas fa-copy"></i>
                    </button>
                  </div>
                </section>

                <section className="bg-white p-6 rounded-xl border border-gray-200">
                  <h3 className="text-sm font-bold text-gray-400 uppercase mb-4">
                    Configuration Details
                  </h3>
                  <div className="space-y-3">
                    {baseUrl && (
                      <div className="flex justify-between text-sm pb-2 border-b border-gray-200">
                        <span className="text-gray-500">Base URL:</span>
                        <span className="font-mono text-gray-700 text-xs break-all">
                          {baseUrl}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Iframe Target:</span>
                      <code className="bg-gray-100 px-2 py-0.5 rounded text-indigo-600 text-xs break-all">
                        {getWidgetUrl(selectedWidget.id, true)}
                      </code>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Suggested Width:</span>
                      <span className="font-mono text-gray-700">
                        {selectedWidget.defaultWidth}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Suggested Height:</span>
                      <span className="font-mono text-gray-700">
                        {selectedWidget.defaultHeight}
                      </span>
                    </div>
                    {selectedWidget.id === "signup" && privacyUrl && (
                      <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                        <span className="text-gray-500">Privacy URL:</span>
                        <span className="font-mono text-gray-700 text-xs break-all">
                          {privacyUrl}
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-24 h-24 bg-indigo-100 rounded-full flex items-center justify-center mb-6 text-indigo-600 text-4xl">
              <i className="fas fa-cubes"></i>
            </div>
            <h2 className="text-2xl font-bold text-gray-800">
              Select a Widget
            </h2>
            <p className="text-gray-500 max-w-md mt-2">
              Explore our library of embeddable components. Click a widget on
              the left to see its preview and get the integration code.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default WidgetPortal;
