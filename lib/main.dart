import 'package:flutter/material.dart';

void main() {
  runApp(const SistemaNominaApp());
}

class SistemaNominaApp extends StatelessWidget {
  const SistemaNominaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Sistema de Nómina',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: const Color(0xFF047857), // Tono esmeralda corporativo
        brightness: Brightness.light,
      ),
      home: const PayrollScreen(),
    );
  }
}

class PayrollScreen extends StatefulWidget {
  const PayrollScreen({super.key});

  @override
  State<PayrollScreen> createState() => _PayrollScreenState();
}

class _PayrollScreenState extends State<PayrollScreen> {
  // Parámetros de liquidación
  double _tasaCambio = 950.00;
  double _pctUsd = 40.0;
  double _pctBs = 60.0;
  String _filtroBusqueda = '';

  late TextEditingController _tasaController;
  late TextEditingController _pctUsdController;
  late TextEditingController _pctBsController;

  // Lista de trabajadores extraída de la nómina real
  final List<Map<String, dynamic>> _empleados = [
    {
      'cedula': '17491032',
      'nombre': 'CARO ESCALANTE CRISTIAN GEORZE',
      'cargo': 'SUPERVISOR',
      'sueldo_base': 65.0,
      'bonos': 96.93,
      'deducciones': 41.93,
      'neto_usd': 119.998,
    },
    {
      'cedula': '19065604',
      'nombre': 'BONILLO GUERRA JOSE GREGORIO',
      'cargo': 'SUPERVISOR',
      'sueldo_base': 65.0,
      'bonos': 81.00,
      'deducciones': 36.00,
      'neto_usd': 109.999,
    },
    {
      'cedula': '19066923',
      'nombre': 'NARVAEZ ALVARADO JHONAN CLAUDIO',
      'cargo': 'SUPERVISOR',
      'sueldo_base': 65.0,
      'bonos': 79.24,
      'deducciones': 27.70,
      'neto_usd': 116.538,
    },
    {
      'cedula': '19255994',
      'nombre': 'MARRERO REYES LAURYS DEHIYETZI',
      'cargo': 'SUPERVISOR',
      'sueldo_base': 65.0,
      'bonos': 89.34,
      'deducciones': 12.50,
      'neto_usd': 141.837,
    },
    {
      'cedula': '20613236',
      'nombre': 'SERNA CAMARGO ANIUSKA GIOMAR',
      'cargo': 'SUPERVISOR',
      'sueldo_base': 65.0,
      'bonos': 99.67,
      'deducciones': 54.67,
      'neto_usd': 110.004,
    },
    {
      'cedula': '6328602',
      'nombre': 'ALVAREZ JARAMILLO JESUS ENRIQUE',
      'cargo': 'VENDEDOR',
      'sueldo_base': 50.0,
      'bonos': 65.50,
      'deducciones': 15.00,
      'neto_usd': 100.50,
    },
  ];

  @override
  void initState() {
    super.initState();
    _tasaController = TextEditingController(
      text: _tasaCambio.toStringAsFixed(2),
    );
    _pctUsdController = TextEditingController(text: _pctUsd.toStringAsFixed(0));
    _pctBsController = TextEditingController(text: _pctBs.toStringAsFixed(0));
  }

  @override
  void dispose() {
    _tasaController.dispose();
    _pctUsdController.dispose();
    _pctBsController.dispose();
    super.dispose();
  }

  void _actualizarPorcentaje(double valorUsd) {
    setState(() {
      _pctUsd = valorUsd.clamp(0.0, 100.0);
      _pctBs = 100.0 - _pctUsd;
      _pctUsdController.text = _pctUsd.toStringAsFixed(0);
      _pctBsController.text = _pctBs.toStringAsFixed(0);
    });
  }

  void _actualizarTasa(String val) {
    final parsed = double.tryParse(val.replaceAll(',', '.'));
    if (parsed != null && parsed > 0) {
      setState(() => _tasaCambio = parsed);
    }
  }

  @override
  Widget build(BuildContext context) {
    final empleadosFiltrados = _empleados.where((e) {
      final query = _filtroBusqueda.toLowerCase();
      final nombre = (e['nombre'] as String).toLowerCase();
      final cedula = e['cedula'] as String;
      final cargo = (e['cargo'] as String).toLowerCase();
      return nombre.contains(query) ||
          cedula.contains(query) ||
          cargo.contains(query);
    }).toList();

    final double totalNeto = empleadosFiltrados.fold(
      0.0,
      (acc, item) => acc + (item['neto_usd'] as double),
    );
    final double desembolsoUsd = totalNeto * (_pctUsd / 100.0);
    final double desembolsoBs = (totalNeto * (_pctBs / 100.0)) * _tasaCambio;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Panel de Nómina - Liquidación Multimoneda'),
        backgroundColor: const Color(0xFF047857),
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Panel de Control de Parámetros
            Card(
              elevation: 2,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              child: Padding(
                padding: const EdgeInsets.all(20.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Parámetros de Liquidación y Tasa',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          flex: 2,
                          child: TextField(
                            controller: _tasaController,
                            keyboardType: const TextInputType.numberWithOptions(
                              decimal: true,
                            ),
                            decoration: const InputDecoration(
                              labelText: 'Tasa de Cambio (Bs./USD)',
                              prefixIcon: Icon(Icons.currency_exchange),
                              border: OutlineInputBorder(),
                            ),
                            onChanged: _actualizarTasa,
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          flex: 1,
                          child: TextField(
                            controller: _pctUsdController,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: '% Divisas (\$)',
                              border: OutlineInputBorder(),
                            ),
                            onChanged: (val) {
                              final p = double.tryParse(val);
                              if (p != null) _actualizarPorcentaje(p);
                            },
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          flex: 1,
                          child: TextField(
                            controller: _pctBsController,
                            readOnly: true,
                            decoration: const InputDecoration(
                              labelText: '% Bolívares (Bs)',
                              border: OutlineInputBorder(),
                              filled: true,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Slider(
                      value: _pctUsd,
                      min: 0,
                      max: 100,
                      divisions: 100,
                      activeColor: const Color(0xFF047857),
                      label: '${_pctUsd.toStringAsFixed(0)}% USD',
                      onChanged: _actualizarPorcentaje,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Tarjetas de Resumen
            Row(
              children: [
                Expanded(
                  child: _MetricCard(
                    title: 'Total Neto General',
                    value: '\$ ${totalNeto.toStringAsFixed(2)}',
                    color: Colors.blueGrey,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _MetricCard(
                    title: 'Pago en Divisas (${_pctUsd.toStringAsFixed(0)}%)',
                    value: '\$ ${desembolsoUsd.toStringAsFixed(2)}',
                    color: const Color(0xFF047857),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _MetricCard(
                    title: 'Pago en Bolívares (${_pctBs.toStringAsFixed(0)}%)',
                    value: 'Bs. ${desembolsoBs.toStringAsFixed(2)}',
                    color: Colors.indigo,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // Barra de búsqueda de trabajadores
            Row(
              children: [
                Expanded(
                  child: TextField(
                    decoration: InputDecoration(
                      hintText: 'Buscar por cédula, nombre o cargo...',
                      prefixIcon: const Icon(Icons.search),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                      ),
                      filled: true,
                    ),
                    onChanged: (val) {
                      setState(() => _filtroBusqueda = val);
                    },
                  ),
                ),
                const SizedBox(width: 16),
                ElevatedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.fingerprint),
                  label: const Text('Cargar Biométrico'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF047857),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 16,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Tabla interactiva
            Card(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  columns: const [
                    DataColumn(label: Text('Cédula')),
                    DataColumn(label: Text('Trabajador')),
                    DataColumn(label: Text('Cargo')),
                    DataColumn(label: Text('Neto (\$)')),
                    DataColumn(label: Text('Monto Divisas (\$)')),
                    DataColumn(label: Text('Monto Bolívares (Bs)')),
                  ],
                  rows: empleadosFiltrados.map((emp) {
                    final double neto = (emp['neto_usd'] as num).toDouble();
                    final double parteUsd = neto * (_pctUsd / 100.0);
                    final double parteBs =
                        (neto * (_pctBs / 100.0)) * _tasaCambio;

                    return DataRow(
                      cells: [
                        DataCell(Text(emp['cedula'] as String)),
                        DataCell(Text(emp['nombre'] as String)),
                        DataCell(Text(emp['cargo'] as String)),
                        DataCell(Text('\$ ${neto.toStringAsFixed(2)}')),
                        DataCell(
                          Text(
                            '\$ ${parteUsd.toStringAsFixed(2)}',
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF047857),
                            ),
                          ),
                        ),
                        DataCell(
                          Text(
                            'Bs. ${parteBs.toStringAsFixed(2)}',
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              color: Colors.indigo,
                            ),
                          ),
                        ),
                      ],
                    );
                  }).toList(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  final String title;
  final String value;
  final Color color;

  const _MetricCard({
    required this.title,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16.0),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              color: color,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(
              color: color,
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}
