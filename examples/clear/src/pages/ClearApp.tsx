import { ClearHeader } from '../components/ClearHeader';
import { QuickEntry } from '../components/QuickEntry';
import { TasksPage } from './TasksPage';
import { ListsPage } from './ListsPage';
import { ThemesPage } from './ThemesPage';
import { screen, errorMessage } from '../state';

export function ClearApp(): i32 {
  return <View className="w-full h-full flex-col bg-[#161616]">
    <ClearHeader />
    {screen() === 'tasks' && <TasksPage />}
    {screen() === 'lists' && <ListsPage />}
    {screen() === 'themes' && <ThemesPage />}
    {errorMessage() !== '' && <Text className="p-3 text-[13px] text-[#ff8c70]">{errorMessage()}</Text>}
    <QuickEntry />
  </View>;
}
