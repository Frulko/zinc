// The phone uses the same editor server and pairs separately; never include the editor's token.
import { language } from '../i18n';
import { remoteAddress } from '../services/link';

export function RemoteAccess(): i32 {
  const address = remoteAddress();
  const french = language() === 'fr';
  if (address === '') return <View />;
  const loopback = address.includes('://127.') || address.includes('://localhost');
  return <View className="p-3 gap-2 rounded bg-zinc-900">
    <Text className="text-sm text-zinc-100">{french ? 'Réglage depuis un téléphone' : 'Align from a phone'}</Text>
    <Text className="text-xs text-zinc-400">{french ? 'Sur le même réseau Wi-Fi, ouvrez cette adresse ou scannez le QR de la carte d’état du mapper, puis saisissez son code.' : 'On the same Wi-Fi network, open this address or scan the QR on the mapper status card, then enter its pairing code.'}</Text>
    <Text className="text-sm text-zinc-100">{address}</Text>
    {loopback && <Text className="text-xs text-amber-400">{french ? 'Adresse locale uniquement : connectez l’éditeur à l’adresse réseau du mapper.' : 'Local address only: connect the editor to the mapper’s network address.'}</Text>}
  </View>;
}
