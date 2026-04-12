import { TABS, type TabKey } from '../types/stock';

interface Props {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  counts: Record<TabKey, number>;
}

export default function ScreeningTabs({ activeTab, onTabChange, counts }: Props) {
  return (
    <div className="flex border-b border-gray-200">
      {TABS.map(tab => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`flex-1 py-3 px-2 text-center text-base font-medium transition-all border-b-2 ${
              isActive
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            <div>{tab.label} ({counts[tab.key]})</div>
            <div className={`text-sm mt-0.5 ${isActive ? 'text-blue-400' : 'text-gray-400'}`}>
              {tab.desc}
            </div>
          </button>
        );
      })}
    </div>
  );
}
