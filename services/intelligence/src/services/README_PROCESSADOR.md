# Processador de Documentos v3

## Conformidade com Diretrizes GEMS - Fase 1

Este módulo implementa o processamento de documentos com validações de qualidade CPO conforme as Diretrizes GEMS.

## Implementações Realizadas

### 1. Trava de DPI (Ref. Fontes 78 e 79) ✅

**Requisito:** O método `validar_cpo` deve verificar a resolução do PDF. Se for menor que 300 DPI, o sistema deve sinalizar como insuficiente para evitar erros de leitura.

**Implementação:**
- Método `_validar_dpi()` verifica se o DPI detectado é >= 300 DPI
- Método `_extrair_dpi_pdf()` e `_detectar_dpi_por_tamanho()` detectam a resolução do PDF
- Se DPI < 300, o status CPO é marcado como "VERMELHO" ou "AMARELO" conforme outras validações
- Mensagem clara indicando DPI insuficiente conforme Ref. Fontes 78 e 79

**Constante:** `DPI_MINIMO_REQUERIDO = 300`

### 2. Métrica de Confiança OCR (Ref. Fonte 3) ✅

**Requisito:** Implementar cálculo de confiança média usando `image_to_data` para validar se a média de confiança (conf) está acima de 95%. Caso contrário, o documento deve ser marcado para revisão.

**Implementação:**
- Método `_validar_confianca_ocr()` usa `pytesseract.image_to_data()` para obter dados detalhados
- Extrai o campo `conf` (confiança) de cada palavra detectada
- Calcula a média de confiança de todas as palavras em todas as páginas
- Se confiança média < 95%, documento é marcado para revisão
- Status CPO reflete a falha na validação OCR

**Constante:** `CONFIANCA_OCR_MINIMA = 95.0`

### 3. Isolamento SaaS (Ref. Fonte 75) ✅

**Requisito:** Incluir parâmetro `tenant_id` nas funções e no JSON de saída, garantindo o isolamento dos dados conforme previsto na arquitetura original.

**Implementação:**
- Classe `ProcessadorDocumentosV3` aceita `tenant_id` no construtor
- Todas as funções públicas (`validar_cpo`, `processar_documento`) aceitam `tenant_id` como parâmetro
- `tenant_id` é incluído em todos os JSONs de saída
- `tenant_id` é usado em logs para rastreabilidade
- Função de conveniência `processar_documento()` também suporta `tenant_id`

## Estrutura do Código

```
ProcessadorDocumentosV3
├── __init__(tenant_id)          # Inicialização com tenant_id
├── validar_cpo()                # Validação CPO completa
│   ├── _validar_dpi()           # Validação DPI (Ref. Fontes 78, 79)
│   └── _validar_confianca_ocr() # Validação OCR (Ref. Fonte 3)
├── processar_documento()        # Processamento completo
└── gerar_json_saida()           # Geração de JSON com tenant_id
```

## Formato de Saída JSON

```json
{
  "tenant_id": "uuid-do-tenant",
  "arquivo": "caminho/para/documento.pdf",
  "timestamp": "2026-01-24T14:30:00Z",
  "status_cpo": "VERDE|AMARELO|VERMELHO",
  "validacoes": {
    "dpi": {
      "aprovado": true,
      "dpi_detectado": 300,
      "dpi_minimo_requerido": 300,
      "mensagem": "DPI aprovado: 300 DPI >= 300 DPI"
    },
    "ocr_confidence": {
      "aprovado": true,
      "confianca_media": 97.5,
      "confianca_minima_requerida": 95.0,
      "mensagem": "Confiança OCR aprovada: 97.50% >= 95.00% (Ref. Fonte 3)"
    }
  },
  "revisao_necessaria": false,
  "erros": []
}
```

## Status CPO

- **VERDE**: Todas as validações aprovadas (DPI >= 300 e OCR >= 95%)
- **AMARELO**: Uma validação falhou (DPI < 300 OU OCR < 95%)
- **VERMELHO**: Ambas validações falharam (DPI < 300 E OCR < 95%) ou erro no processamento

## Dependências

As seguintes dependências foram adicionadas ao `pyproject.toml` e `requirements.txt`:

- `pytesseract>=0.3.10` - OCR engine
- `Pillow>=10.0.0` - Processamento de imagens
- `pdf2image>=1.16.3` - Conversão PDF para imagem
- `pdfplumber>=0.10.0` - Análise de PDF

## Uso

### Como módulo Python

```python
from services.processador_documentos_v3 import ProcessadorDocumentosV3

# Com tenant_id
processador = ProcessadorDocumentosV3(tenant_id="uuid-do-tenant")
resultado = processador.validar_cpo("caminho/para/documento.pdf")

# Ou usando função de conveniência
from services.processador_documentos_v3 import processar_documento
resultado = processar_documento("caminho/para/documento.pdf", tenant_id="uuid")
```

### Como script CLI

```bash
python processador_documentos_v3.py caminho/para/documento.pdf [tenant_id]
```

## Logs

O módulo utiliza logging estruturado com informações de:
- `tenant_id` em todas as operações
- Status das validações
- Erros e exceções
- Métricas de DPI e confiança OCR

## Notas Técnicas

1. **Detecção de DPI**: A detecção de DPI é feita através da conversão do PDF para imagem e análise das dimensões. Para detecção mais precisa, pode ser necessário usar bibliotecas adicionais que leem metadados do PDF diretamente.

2. **OCR**: O OCR é configurado para português (`lang='por'`). Para outros idiomas, ajuste o parâmetro `lang` no método `_validar_confianca_ocr()`.

3. **Performance**: Para PDFs grandes, considere processar páginas em paralelo ou implementar cache de resultados.

4. **Tesseract**: Requer instalação do Tesseract OCR no sistema. No Docker, adicione ao Dockerfile:
   ```dockerfile
   RUN apt-get update && apt-get install -y tesseract-ocr tesseract-ocr-por
   ```

## Conformidade

✅ **Fonte 78 e 79**: Validação de DPI mínimo de 300 DPI implementada  
✅ **Fonte 3**: Cálculo de confiança média OCR com threshold de 95% implementado  
✅ **Fonte 75**: Isolamento SaaS com `tenant_id` em todas as funções e JSONs de saída

## Próximos Passos (Fase 2)

- Integração com banco de dados para armazenar resultados
- API REST para exposição do serviço
- Cache de resultados de validação
- Processamento assíncrono para documentos grandes
- Suporte a múltiplos formatos (DOCX, TIFF, etc.)
