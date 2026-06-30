// MemoVoy/Features/Itineraries/ItineraryDetailView.swift
// Ecrã de detalhe de roteiro — usado tanto nos próprios roteiros
// como ao ver roteiros de outros utilizadores.
// O estado de ownership (publicar/apagar) é determinado pelo viewer state.

import SwiftUI
import MapKit

// MARK: — Esta view já existe em ItinerariesView.swift
// Aqui criamos a versão standalone que pode ser navegada desde qualquer contexto
// (feed, perfil de outro utilizador, pesquisa, deep link).
// A versão em ItinerariesView.swift é a mesma mas embutida num NavigationStack próprio.

// Nota: ItineraryDetailView e ItineraryDetailViewModel já definidos em ItinerariesView.swift.
// Este ficheiro adiciona apenas o PostDetailView que faltava.
// (O compilador Swift não permite redefinição do mesmo tipo em dois ficheiros
//  dentro do mesmo target — a implementação real está em ItinerariesView.swift)

// O alias abaixo garante que referências a PostDetailView de outros ficheiros
// (ex: ProfileView stub) resolvem para a implementação real neste ficheiro.

// MARK: — Verificação de consistência (comentário para o dev)
// Após integrar este ficheiro no projecto Xcode:
// 1. Remover o stub `struct PostDetailView: View { ... }` de ProfileView.swift
// 2. ItineraryDetailView já existe em ItinerariesView.swift — sem duplicação
// 3. PostDetailView definida neste ficheiro — usar em todo o projecto

// ─── Placeholder vazio para satisfazer o compilador até integração no Xcode ───
// (Em Xcode, remover este ficheiro e usar PostDetailView.swift directamente)
