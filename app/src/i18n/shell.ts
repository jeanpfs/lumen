import type { Bundle } from "./lang";

const en = {
  // BluetoothGate
  btOffTitle: "Bluetooth is off",
  btOffTextAndroid: "Lumen only works with Bluetooth on. Turn it on to continue.",
  btOffTextDesktop: "Lumen only works with Bluetooth on. Turn it on in system settings; this screen goes away by itself.",
  btTurnOn: "Turn on Bluetooth",
  btOpenSettings: "Open Bluetooth settings",
  // ErrorBoundary
  errorTitle: "Something went wrong",
  errorReload: "Reload",
  // Shell
  btUnavailableLead: "Bluetooth unavailable.",
  btUnavailableText: " The strips are not receiving commands. Check the Bluetooth permission.",
  // StripPreview
  previewCaption: "Look at the real strip",
  previewNote: "what will be sent",
  previewOn: "Strip on",
  previewOff: "Strip off",
  // Sheet
  close: "Close",
  // parts
  presumedTip: "The strip does not confirm commands. The state shown is the last one sent.",
  presumedState: "presumed state",
  turnOff: (name: string) => `Turn off ${name}`,
  turnOn: (name: string) => `Turn on ${name}`,
  linkLive: "Live",
  linkUnknown: "No contact yet",
  linkUnreachable: "Unreachable",
  linkRetrying: "Retrying…",
  tryAgain: "Try again",
  // Welcome
  welcomeTitle: "Your LED strips, from any brand, in one place.",
  welcomeLead:
    "Groups of any size, color and brightness per strip, and effects. The system may ask for these permissions when they are needed.",
  permBluetoothWhy: "To find and control strips nearby. The system asks on the first scan.",
  permRequired: "required",
  permOptional: "optional",
  continue: "Continue",
  // FirstRun
  firstRunTitle: "Let's add your first strip",
  firstRunLead:
    "The wizard finds your strip over Bluetooth, shows it colors and brightness, and you just answer what you see. At the end, Lumen knows exactly how to talk to it.",
  getStarted: "Get started",
  // store: toasts and event log
  unreachableEvent: (n: number) => `Unreachable: ${n}`,
  effectsUnavailable: (n: number) => `Effects are not available on ${n} strip(s) of this target`,
  opSend: "Send",
  opLoadStrips: "Load strips",
  opCreateGroup: "Create group",
  opAddToGroup: "Add to group",
  opRemoveFromGroup: "Remove from group",
  opReorder: "Reorder",
  opRenameGroup: "Rename group",
  opDeleteGroup: "Delete group",
  opRenameStrip: "Rename strip",
  opRemoveStrip: "Remove strip",
  opColorOrder: "Color order",
};

export const shell: Bundle<typeof en> = {
  en,
  "pt-BR": {
    btOffTitle: "O Bluetooth está desligado",
    btOffTextAndroid: "O Lumen só funciona com o Bluetooth ligado. Ligue para continuar.",
    btOffTextDesktop:
      "O Lumen só funciona com o Bluetooth ligado. Ligue nas configurações do sistema; esta tela some sozinha.",
    btTurnOn: "Ligar o Bluetooth",
    btOpenSettings: "Abrir configurações do Bluetooth",
    errorTitle: "Algo deu errado",
    errorReload: "Recarregar",
    btUnavailableLead: "Bluetooth indisponível.",
    btUnavailableText: " As fitas não estão recebendo comandos. Verifique a permissão do Bluetooth.",
    previewCaption: "Olhe para a fita de verdade",
    previewNote: "o que vai ser enviado",
    previewOn: "Fita ligada",
    previewOff: "Fita desligada",
    close: "Fechar",
    presumedTip: "A fita não confirma os comandos. O estado mostrado é o último enviado.",
    presumedState: "estado presumido",
    turnOff: (name) => `Desligar ${name}`,
    turnOn: (name) => `Ligar ${name}`,
    linkLive: "Ao vivo",
    linkUnknown: "Sem contato ainda",
    linkUnreachable: "Fora de alcance",
    linkRetrying: "Tentando de novo…",
    tryAgain: "Tentar de novo",
    welcomeTitle: "Suas fitas de LED, de qualquer marca, em um só lugar.",
    welcomeLead:
      "Grupos de qualquer tamanho, cor e brilho para cada fita, e efeitos. O sistema pode pedir estas permissões quando forem necessárias.",
    permBluetoothWhy: "Para encontrar e controlar fitas por perto. O sistema pergunta na primeira busca.",
    permRequired: "obrigatória",
    permOptional: "opcional",
    continue: "Continuar",
    firstRunTitle: "Vamos adicionar sua primeira fita",
    firstRunLead:
      "A configuração encontra sua fita por Bluetooth, mostra cores e brilho para ela, e você só responde o que vê. No fim, o Lumen sabe exatamente como falar com ela.",
    getStarted: "Começar",
    unreachableEvent: (n) => `Fora de alcance: ${n}`,
    effectsUnavailable: (n) => `Efeitos indisponíveis em ${n} ${n === 1 ? "fita" : "fitas"}`,
    opSend: "Enviar",
    opLoadStrips: "Carregar fitas",
    opCreateGroup: "Criar grupo",
    opAddToGroup: "Adicionar ao grupo",
    opRemoveFromGroup: "Remover do grupo",
    opReorder: "Reordenar",
    opRenameGroup: "Renomear grupo",
    opDeleteGroup: "Excluir grupo",
    opRenameStrip: "Renomear fita",
    opRemoveStrip: "Remover fita",
    opColorOrder: "Ordem das cores",
  },
};
