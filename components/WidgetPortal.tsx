
import React, { useState } from 'react';
import { WIDGETS } from '../constants';
import { WidgetMetadata } from '../types';

const WidgetPortal: React.FC = () => {
  const [selectedWidget, setSelectedWidget] = useState<WidgetMetadata | null>(null);

  const getWidgetUrl = (id: string) => {
    // Generates the hash-based URL that points to the specific component
    const baseUrl = window.location.href.split('#')[0];
    return `${baseUrl}#/widget/${id}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Embed code copied!');
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
          {WIDGETS.map(widget => (
            <button
              key={widget.id}
              onClick={() => setSelectedWidget(widget)}
              className={`w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3 ${selectedWidget?.id === widget.id ? 'bg-indigo-700 shadow-inner' : 'hover:bg-indigo-800'
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
      <main className="flex-1 bg-gray-50 flex flex-col">
        {selectedWidget ? (
          <div className="p-8 max-w-7xl mx-auto w-full">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-gray-800">{selectedWidget.name}</h2>
              <p className="text-gray-500 mt-2">{selectedWidget.description}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Preview */}
              <div className="space-y-6">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <i className="fas fa-eye text-indigo-500"></i> Live Preview
                </h3>
                <div
                  className="bg-white rounded-xl shadow-lg border-4 border-white overflow-hidden relative mx-auto"
                  style={{
                    height: selectedWidget.defaultHeight,
                    maxWidth: selectedWidget.defaultWidth === '100%' ? '100%' : selectedWidget.defaultWidth,
                    width: '100%'
                  }}
                >
                  <iframe
                    src={getWidgetUrl(selectedWidget.id)}
                    className="w-full h-full border-none"
                    title={selectedWidget.name}
                  />
                </div>
              </div>

              {/* Implementation */}
              <div className="space-y-6">
                <section>
                  <h3 className="text-lg font-semibold flex items-center gap-2 mb-3">
                    <i className="fas fa-code text-green-500"></i> Embed Code
                  </h3>
                  <div className="bg-gray-900 rounded-lg p-4 relative group">
                    <pre className="text-green-400 text-sm overflow-x-auto">
                      {`<iframe\n  src="${getWidgetUrl(selectedWidget.id)}"\n  width="${selectedWidget.defaultWidth}"\n  height="${selectedWidget.defaultHeight}"\n  style="border:none; border-radius:12px; overflow:hidden;"\n></iframe>`}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(`<iframe src="${getWidgetUrl(selectedWidget.id)}" width="${selectedWidget.defaultWidth}" height="${selectedWidget.defaultHeight}" style="border:none; border-radius:12px; overflow:hidden;"></iframe>`)}
                      className="absolute top-4 right-4 bg-gray-700 text-white p-2 rounded hover:bg-gray-600 transition"
                    >
                      <i className="fas fa-copy"></i>
                    </button>
                  </div>
                </section>

                <section className="bg-white p-6 rounded-xl border border-gray-200">
                  <h3 className="text-sm font-bold text-gray-400 uppercase mb-4">Configuration Details</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Iframe Target:</span>
                      <code className="bg-gray-100 px-2 py-0.5 rounded text-indigo-600">{getWidgetUrl(selectedWidget.id)}</code>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Suggested Width:</span>
                      <span className="font-mono text-gray-700">{selectedWidget.defaultWidth}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Suggested Height:</span>
                      <span className="font-mono text-gray-700">{selectedWidget.defaultHeight}</span>
                    </div>
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
            <h2 className="text-2xl font-bold text-gray-800">Select a Widget</h2>
            <p className="text-gray-500 max-w-md mt-2">
              Explore our library of embeddable components. Click a widget on the left to see its preview and get the integration code.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default WidgetPortal;
